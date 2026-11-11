const BLOCKING_SCHEDULE_STATUSES = ["scheduled", "publishing", "published", "unknown"];

async function assertPinCanBeRejected(supabase, userId, pinId) {
  const ownerId = String(userId);
  const savedPinId = String(pinId);
  const [schedules, attempts, publications] = await Promise.all([
    supabase.from("pin_schedules")
      .select("id")
      .eq("user_id", ownerId)
      .eq("pin_id", savedPinId)
      .in("status", BLOCKING_SCHEDULE_STATUSES)
      .limit(1),
    supabase.from("pinterest_publish_attempts")
      .select("pin_id")
      .eq("user_id", ownerId)
      .eq("pin_id", savedPinId)
      .limit(1),
    supabase.from("pinterest_publications")
      .select("pin_id")
      .eq("user_id", ownerId)
      .eq("pin_id", savedPinId)
      .limit(1),
  ]);

  const error = schedules.error || attempts.error || publications.error;
  if (error) throw error;
  if ((schedules.data || []).length || (attempts.data || []).length || (publications.data || []).length) {
    const conflict = new Error("Этот пин связан с расписанием или историей публикации. Сначала разберите публикацию в календаре.");
    conflict.httpStatus = 409;
    throw conflict;
  }
}

module.exports = { assertPinCanBeRejected, BLOCKING_SCHEDULE_STATUSES };
