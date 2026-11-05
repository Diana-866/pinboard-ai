const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_FIELD_NAME_LENGTH = 256;
const MAX_ARRAY_INDEX = 19;
const MAX_FIELD_DEPTH = 8;
const MAX_ARRAY_DEPTH = 2;

function tokenizeFieldName(name) {
  const value = String(name);
  if (!value || value.length > MAX_FIELD_NAME_LENGTH) {
    throw new Error("Invalid multipart field name");
  }

  const tokens = [];
  const first = /^[^\[\]]+/.exec(value);
  if (!first) throw new Error("Invalid multipart field name");
  tokens.push(first[0]);
  let cursor = first[0].length;

  while (cursor < value.length) {
    if (value[cursor] !== "[") throw new Error("Invalid multipart field name");
    const end = value.indexOf("]", cursor + 1);
    if (end < 0) throw new Error("Invalid multipart field name");
    const token = value.slice(cursor + 1, end);
    if (!token || token.includes("[") || FORBIDDEN_KEYS.has(token)) {
      throw new Error("Invalid multipart field name");
    }
    tokens.push(token);
    cursor = end + 1;
  }

  if (
    tokens.length > MAX_FIELD_DEPTH ||
    tokens.some((token) => FORBIDDEN_KEYS.has(token)) ||
    tokens.filter((token) => /^\\d+$/.test(token)).length > MAX_ARRAY_DEPTH
  ) {
    throw new Error("Invalid multipart field name");
  }
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
      let key = token;

      if (Array.isArray(current)) {
        if (!/^\d+$/.test(token)) {
          throw new Error("Array fields must use numeric indexes");
        }
        key = Number(token);
        if (!Number.isSafeInteger(key) || key > MAX_ARRAY_INDEX) {
          throw new Error("Multipart array index is out of range");
        }
      }

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
