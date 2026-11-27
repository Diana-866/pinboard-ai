"use strict";

function getAvailableImageModels(models, markup, ceilCredits, allowedModelIds) {
  const rows = Array.isArray(models) ? models : [];
  return rows
    .filter((model) => model && typeof model.id === "string"
      && model.id.trim()
      && (!Array.isArray(allowedModelIds) || allowedModelIds.includes(model.id))
      && Number.isFinite(Number(model.price))
      && Number(model.price) > 0
      && model.deprecated !== true
      && Array.isArray(model.params)
      && model.params.includes("aspect_ratio"))
    .map((model) => ({
      id: model.id,
      providerPrice: Number(model.price),
      creditsPerImage: ceilCredits(Number(model.price) * markup),
    }))
    .sort((a, b) => a.creditsPerImage - b.creditsPerImage
      || a.providerPrice - b.providerPrice
      || a.id.localeCompare(b.id));
}

module.exports = { getAvailableImageModels };
