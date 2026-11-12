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
    (payload.description == null || typeof payload.description === "string")
  );
}

function reconcileReviewQueueRows(queueRows, pinsById, userId) {
  const active = [];
  const staleIds = [];
  const invalidIds = [];
  const ownerId = String(userId);

  for (const row of queueRows || []) {
    // Preserve malformed persisted rows for recovery. The API reports a restore
    // conflict instead of silently deleting user data or pretending the queue is empty.
    if (!hasRenderablePayload(row)) {
      if (row && row.id != null) invalidIds.push(String(row.id));
      continue;
    }

    const pinId = row.pin_id || row.payload.pinId || null;
    if (!pinId) {
      active.push({ ...row.payload, description: row.payload.description == null ? "" : row.payload.description, id: row.id, pinId: undefined });
      continue;
    }

    const pin = pinsById.get(String(pinId));
    const pinOwnerId = pin && pin.boards && pin.boards.projects && pin.boards.projects.user_id;
    if (!pin || String(pinOwnerId || "") !== ownerId || pin.status === "rejected") {
      staleIds.push(String(row.id));
      continue;
    }

    active.push({ ...row.payload, description: row.payload.description == null ? "" : row.payload.description, id: row.id, pinId: String(pin.id), pinStatus: pin.status || "pending" });
  }

  return { active, staleIds, invalidIds };
}

module.exports = { reconcileReviewQueueRows };
