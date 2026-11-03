// Не допускаем сохранение временных URL генератора: Pinterest должен иметь
// возможность скачать изображение и после истечения срока ссылки GPTunnel.
async function persistGeneratedImage(image, rehost) {
  if (!image || !image.url || image.price == null) return null;
  const permanentUrl = await rehost(image.url);
  if (typeof permanentUrl !== "string" || !/^https:\/\//i.test(permanentUrl)) {
    throw new Error("Постоянное хранилище не вернуло HTTPS-ссылку");
  }
  return { ...image, url: permanentUrl };
}

module.exports = { persistGeneratedImage };
