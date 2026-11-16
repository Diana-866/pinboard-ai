function reconcileReviewQueueRows(queueRows, pinsById, userId, scheduledPinIds = new Set()) {
  const active = [];
  const staleIds = [];
  const ownerId = String(userId);
  const scheduledIds = scheduledPinIds instanceof Set ? scheduledPinIds : new Set(scheduledPinIds || []);

  for (const row of queueRows || []) {
    const pinId = row.pin_id || (row.payload && row.payload.pinId) || null;
    if (!pinId) {
      active.push({ ...row.payload, id: row.id, pinId: undefined });
      continue;
    }

    const pin = pinsById.get(String(pinId));
    const pinOwnerId = pin && pin.boards && pin.boards.projects && pin.boards.projects.user_id;
    if (!pin || String(pinOwnerId || "") !== ownerId || pin.status === "rejected" || scheduledIds.has(String(pinId))) {
      staleIds.push(String(row.id));
      continue;
    }

    // Keep scheduling/review-only metadata from the queue payload, but always
    // render the current creative from the owned pin row. This prevents a
    // regenerated/replaced image or edited description from reverting to the
    // stale snapshot captured when the item first entered the queue.
    active.push({
      ...row.payload,
      id: row.id,
      pinId: String(pin.id),
      pinStatus: pin.status || "pending",
      title: typeof pin.title === "string" ? pin.title : row.payload.title,
      description: typeof pin.description === "string" ? pin.description : row.payload.description,
      imageUrl: typeof pin.image_url === "string" ? pin.image_url : "",
      boardId: pin.board_id ? String(pin.board_id) : row.payload.boardId,
      boardName: pin.boards && typeof pin.boards.title === "string"
        ? pin.boards.title
        : row.payload.boardName,
    });
  }

  return { active, staleIds };
}

module.exports = { reconcileReviewQueueRows };
