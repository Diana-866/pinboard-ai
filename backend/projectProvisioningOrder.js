/**
 * Keep the default project choice stable across board-create retries.
 * Supabase does not promise row order unless the application defines it.
 */
function sortProjectsForProvisioning(projects) {
  if (!Array.isArray(projects)) return [];
  return [...projects].sort((left, right) => {
    const leftCreated = typeof left?.created_at === "string" ? left.created_at : "";
    const rightCreated = typeof right?.created_at === "string" ? right.created_at : "";
    const byCreatedAt = leftCreated.localeCompare(rightCreated);
    if (byCreatedAt !== 0) return byCreatedAt;
    return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
  });
}

module.exports = { sortProjectsForProvisioning };
