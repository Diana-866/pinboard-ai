function serializeUntrustedPromptContext(value) {
  // JSON escaping alone does not stop the data from closing the delimiter it is placed in: a scraped
  // site summary or a board title can contain `</project_context_json>` and everything after it then
  // reads as instructions rather than as data. Writing every "<" as the JSON escape for it keeps the value
  // byte-identical after parsing (so the round trip still holds) while making a tag impossible to form.
  const ESCAPED_LT = String.fromCharCode(92) + "u003c";
  return JSON.stringify(value, null, 2).replace(/</g, ESCAPED_LT);
}

module.exports = { serializeUntrustedPromptContext };
