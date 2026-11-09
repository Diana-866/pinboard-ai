function applyPinImageCompareAndSwapFilter(query, expectedImageUrl) {
  return expectedImageUrl == null
    ? query.is("image_url", null)
    : query.eq("image_url", expectedImageUrl);
}

module.exports = { applyPinImageCompareAndSwapFilter };
