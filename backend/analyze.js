const axios = require("axios");
const cheerio = require("cheerio");
const dns = require("dns").promises;
const net = require("net");
const { generateText } = require("./gptunnel");
const { httpError } = require("./validate");

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const p = ip.split(".").map(Number);
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return true; // локальные
    if (p[0] === 169 && p[1] === 254) return true; // link-local
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true; // приватный диапазон
    if (p[0] === 192 && p[1] === 168) return true; // приватный диапазон
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    if (p[0] >= 224) return true; // multicast / reserved
    return false;
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80")) {
    return true;
  }
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7)); // IPv4-mapped IPv6
  return false;
}

// Защита от SSRF (B1): только публичные http/https-адреса
async function assertPublicUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw httpError(422, "Некорректный URL сайта");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw httpError(422, "Сайт должен начинаться с http:// или https://");
  }
  if (/\s/.test(rawUrl)) throw httpError(422, "Некорректный URL сайта");

  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw httpError(422, "Этот адрес недоступен для анализа");
  }

  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
      throw httpError(422, "Этот адрес недоступен для анализа");
    }
  } catch (e) {
    if (e && e.httpStatus) throw e;
    throw httpError(502, "Не удалось найти сайт — проверьте адрес");
  }
  return u.toString();
}

async function fetchSiteContent(url) {
  const safeUrl = await assertPublicUrl(url);

  let response;
  try {
    response = await axios.get(safeUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PinSprigBot/1.0)" },
      timeout: 12000,
      maxRedirects: 3,
      maxContentLength: 2 * 1024 * 1024,
      maxBodyLength: 2 * 1024 * 1024,
      validateStatus: (s) => s >= 200 && s < 400,
    });
  } catch (e) {
    if (e && e.response) {
      throw httpError(502, `Сайт ответил ошибкой ${e.response.status} — откройте его вручную и проверьте`);
    }
    throw httpError(502, "Сайт недоступен — проверьте адрес или попробуйте позже");
  }

  const $ = cheerio.load(response.data);

  const title = $("title").text().trim();
  const metaDescription = $('meta[name="description"]').attr("content") || "";

  const headings = [];
  $("h1, h2").each((i, el) => {
    if (headings.length < 15) headings.push($(el).text().trim());
  });

  const paragraphs = [];
  $("p").each((i, el) => {
    if (paragraphs.length < 10) {
      const text = $(el).text().trim();
      if (text.length > 30) paragraphs.push(text);
    }
  });

  return { title, metaDescription, headings, paragraphs };
}

async function analyzeSite(url) {
  const content = await fetchSiteContent(url);

  const prompt = `Вот данные с сайта:
Заголовок страницы: ${content.title}
Мета-описание: ${content.metaDescription}
Заголовки разделов: ${content.headings.join("; ")}
Отрывки текста: ${content.paragraphs.slice(0, 5).join(" ")}

Определи нишу этого сайта (коротко, 2-4 слова) и напиши краткое саммари (2-3 предложения) о том, чем занимается сайт и для какой аудитории. Ответь строго в формате JSON без лишнего текста: {"niche": "...", "summary": "..."}`;

  const aiResponse = await generateText(prompt);

  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
  } catch (e) {
    return { niche: "Не удалось определить", summary: aiResponse };
  }
}

module.exports = { analyzeSite };
