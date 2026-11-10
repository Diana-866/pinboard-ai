// Compare database ownership identifiers without trusting nested relation shape.
// UUIDs are case-insensitive; absent or malformed values must fail closed.
function isOwnedByUser(resourceOwnerId, userId) {
  if (typeof resourceOwnerId !== "string" || typeof userId !== "string") return false;
  const owner = resourceOwnerId.trim();
  const requester = userId.trim();
  return owner.length > 0 && requester.length > 0 && owner.toLowerCase() === requester.toLowerCase();
}

module.exports = { isOwnedByUser };
