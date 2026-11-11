function reconcileReviewQueueRows(queueRows, pinsById, userId) {
  const active = [];
  const staleIds = [];
  const ownerId = String(userId);

  for (const row of queueRows || []) {
    const pinId = row.pin_id || (row.payload && row.payload.pinId) || null;
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

    active.push({ ...row.payload, id: row.id, pinId: String(pin.id) });
  }

  return { active, staleIds };
}

module.exports = { reconcileReviewQueueRows };
