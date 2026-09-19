const axios = require('axios');
const cheerio = require('cheerio');
const { generateText } = require('./gptunnel');

async function fetchSiteContent(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PinboardAIBot/1.0)' },
    timeout: 10000,
  });
  const $ = cheerio.load(response.data);

  const title = $('title').text().trim();
  const metaDescription = $('meta[name="description"]').attr('content') || '';

  const headings = [];
  $('h1, h2').each((i, el) => {
    if (headings.length < 15) headings.push($(el).text().trim());
  });

  const paragraphs = [];
  $('p').each((i, el) => {
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
Заголовки разделов: ${content.headings.join('; ')}
Отрывки текста: ${content.paragraphs.slice(0, 5).join(' ')}

Определи нишу этого сайта (коротко, 2-4 слова) и напиши краткое саммари (2-3 предложения) о том, чем занимается сайт и для какой аудитории. Ответь строго в формате JSON без лишнего текста: {"niche": "...", "summary": "..."}`;

  const aiResponse = await generateText(prompt);

  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    return JSON.parse(jsonMatch ? jsonMatch[0] : aiResponse);
  } catch (e) {
    return { niche: 'Не удалось определить', summary: aiResponse };
  }
}

module.exports = { analyzeSite };