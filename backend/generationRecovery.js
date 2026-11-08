const RECOVERY_STATUSES = new Set(["processing", "completed", "failed", "unknown"]);

function serializeGenerationRecovery(request) {
  const status = RECOVERY_STATUSES.has(request && request.status)
    ? request.status
    : "unknown";
  const pins = status === "completed" && Array.isArray(request.pins)
    ? request.pins.map((pin) => ({
        id: pin.id,
        title: pin.title || "",
        description: pin.description || "",
        image_url: pin.image_url || "",
        model_used: pin.model_used || null,
        aspect_ratio: pin.aspect_ratio || null,
        credits_cost: pin.credits_cost == null ? null : pin.credits_cost,
      }))
    : [];

  return {
    status,
    board_id: request.board_id,
    pins,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

module.exports = { serializeGenerationRecovery };
