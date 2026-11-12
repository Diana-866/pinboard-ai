function serializeUntrustedPromptContext(value) {
  return JSON.stringify(value, null, 2);
}

module.exports = { serializeUntrustedPromptContext };
