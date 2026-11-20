const { httpError } = require("./validate");

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

/**
 * Section 129. Setting a pin back to `approved` was allowed unconditionally, so a pin that had already
 * gone out to Pinterest reappeared in the review queue as if it had never been published: the customer
 * saw it waiting for approval again, and the only thing stopping a second pin was a fence several
 * layers down in the publication path. The state itself must refuse, and it must say which fact blocks
 * it - a schedule that is about to publish, or a publication that already happened.
 */
async function assertPinCanBeApproved(supabase, userId, pinId) {
  const ownerId = String(userId);
  const savedPinId = String(pinId);
  const [schedules, publications] = await Promise.all([
    supabase.from("pin_schedules")
      .select("id")
      .eq("user_id", ownerId)
      .eq("pin_id", savedPinId)
      .in("status", BLOCKING_SCHEDULE_STATUSES)
      .limit(1),
    supabase.from("pinterest_publications")
      .select("pin_id")
      .eq("user_id", ownerId)
      .eq("pin_id", savedPinId)
      .limit(1),
  ]);

  const error = schedules.error || publications.error;
  if (error) throw error;
  if ((publications.data || []).length) {
    const published = httpError(409, "Этот пин уже опубликован в Pinterest. Повторная публикация создала бы дубликат.");
    published.details = { code: "publication_reconciliation_required" };
    throw published;
  }
  if ((schedules.data || []).length) {
    const scheduled = httpError(409, "Этот пин уже стоит в календаре публикаций. Сначала отмените расписание.");
    scheduled.details = { code: "pin_already_scheduled" };
    throw scheduled;
  }
}

module.exports = { assertPinCanBeRejected, assertPinCanBeApproved, BLOCKING_SCHEDULE_STATUSES };
