function hasRenderablePayload(row) {
  const payload = row && row.payload;
  return Boolean(
    row &&
    typeof row.id === "string" &&
    row.id.trim().length > 0 &&
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    payload.id === row.id &&
    typeof payload.title === "string" &&
    payload.title.trim().length > 0 &&
    typeof payload.description === "string"
  );
}

function reconcileReviewQueueRows(queueRows, pinsById, userId) {
  const active = [];
  const staleIds = [];
  const ownerId = String(userId);

  for (const row of queueRows || []) {
    // A malformed persisted JSON payload cannot be rendered safely. Remove only
    // this user's unusable queue row in the caller; never expose partial items.
    if (!hasRenderablePayload(row)) {
      if (row && row.id != null) staleIds.push(String(row.id));
      continue;
    }

    const pinId = row.pin_id || row.payload.pinId || null;
    if (!pinId) {
      active.push({ ...row.payload, id: row.id, pinId: undefined });
      continue;
    }

    const pin = pinsById.get(String(pinId));
    const pinOwnerId = pin && pin.boards && pin.boards.projects && pin.boards.projects.user_id;
    if (!pin || String(pinOwnerId || "") !== ownerId || pin.status === "rejected") {
      staleIds.push(String(row.id));
      continue;
    }

    active.push({ ...row.payload, id: row.id, pinId: String(pin.id), pinStatus: pin.status || "pending" });
  }

  return { active, staleIds };
}

module.exports = { reconcileReviewQueueRows };
