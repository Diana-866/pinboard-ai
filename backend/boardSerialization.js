function stripProjectOwner(project) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return project;
  const { user_id: _userId, ...publicProject } = project;
  return publicProject;
}

function serializeBoardForClient(board) {
  if (!board || typeof board !== "object" || Array.isArray(board)) return board;
  const {
    create_request_id: _createRequestId,
    create_request_fingerprint: _createRequestFingerprint,
    ...publicBoard
  } = board;
  if (Array.isArray(publicBoard.projects)) {
    publicBoard.projects = publicBoard.projects.map(stripProjectOwner);
  } else if (publicBoard.projects && typeof publicBoard.projects === "object") {
    publicBoard.projects = stripProjectOwner(publicBoard.projects);
  }
  return publicBoard;
}

module.exports = { serializeBoardForClient };
