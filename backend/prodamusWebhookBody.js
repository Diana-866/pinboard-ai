const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function tokenizeFieldName(name) {
  const tokens = [];
  const pattern = /([^\[\]]+)|\[([^\[\]]*)\]/g;
  let match;
  while ((match = pattern.exec(String(name))) !== null) {
    const token = match[1] !== undefined ? match[1] : match[2];
    if (!token || FORBIDDEN_KEYS.has(token)) {
      throw new Error("Invalid multipart field name");
    }
    tokens.push(token);
  }
  if (!tokens.length) throw new Error("Invalid multipart field name");
  return tokens;
}

function parseMultipartFields(fields) {
  const result = {};
  for (const [name, value] of Object.entries(fields || {})) {
    const tokens = tokenizeFieldName(name);
    let current = result;
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      const isLast = i === tokens.length - 1;
      const key = Array.isArray(current) && /^\d+$/.test(token) ? Number(token) : token;
      if (isLast) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          throw new Error("Duplicate multipart field");
        }
        current[key] = value;
        continue;
      }
      const nextIsIndex = /^\d+$/.test(tokens[i + 1]);
      if (current[key] === undefined) current[key] = nextIsIndex ? [] : {};
      if (!current[key] || typeof current[key] !== "object") {
        throw new Error("Conflicting multipart field structure");
      }
      current = current[key];
    }
  }
  return result;
}

module.exports = { parseMultipartFields };
