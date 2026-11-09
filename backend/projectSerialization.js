function serializeProjectForClient(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return project;
  const { user_id: _userId, ...publicProject } = project;
  return publicProject;
}

module.exports = { serializeProjectForClient };
