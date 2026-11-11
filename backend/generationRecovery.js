const RECOVERY_STATUSES = new Set(["processing", "completed", "failed", "unknown"]);

function isDurableRecoveryPin(pin) {
  if (!pin || typeof pin !== "object" || Array.isArray(pin)) return false;
  if (typeof pin.id !== "string" || !pin.id.trim()) return false;
  if (typeof pin.image_url !== "string" || !pin.image_url.trim()) return false;

  try {
    const imageUrl = new URL(pin.image_url);
    return (imageUrl.protocol === "https:" || imageUrl.protocol === "http:") &&
      !imageUrl.username && !imageUrl.password;
  } catch {
    return false;
  }
}

function serializeGenerationRecovery(request) {
  const reportedStatus = RECOVERY_STATUSES.has(request && request.status)
    ? request.status
    : "unknown";
  const pins = reportedStatus === "completed" && Array.isArray(request.pins)
    ? request.pins.filter(isDurableRecoveryPin).map((pin) => ({
        id: pin.id,
        title: pin.title || "",
        description: pin.description || "",
        image_url: pin.image_url,
        model_used: pin.model_used || null,
        aspect_ratio: pin.aspect_ratio || null,
        credits_cost: pin.credits_cost == null ? null : pin.credits_cost,
      }))
    : [];
  // Do not tell the client a request completed if no durable saved pin can be
  // returned. Keep it uncertain so the client retains its recovery identity.
  const status = reportedStatus === "completed" && pins.length === 0
    ? "unknown"
    : reportedStatus;

  return {
    status,
    board_id: request.board_id,
    pins,
    created_at: request.created_at,
    updated_at: request.updated_at,
  };
}

module.exports = { serializeGenerationRecovery, isDurableRecoveryPin };
