"use strict";

const { httpError } = require("./validate");

function readArrayQueryResult(result) {
  if (result && result.error) throw result.error;
  if (!result || typeof result !== "object" || Array.isArray(result) || !Array.isArray(result.data)) {
    throw httpError(502, "Источник данных вернул некорректную страницу. Повторите попытку позже.");
  }
  return result.data;
}

async function fetchAllPages(queryForRange, { pageSize = 500, maxRows = 10000 } = {}) {
  if (typeof queryForRange !== "function") throw new TypeError("queryForRange must be a function");
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new TypeError("pageSize must be an integer from 1 to 1000");
  }
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new TypeError("maxRows must be a positive safe integer");
  }

  const rows = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const requested = Math.min(pageSize, maxRows - offset);
    // Validate the whole query envelope, not only its data field. This also
    // lets bounded one-off lookups share the same fail-closed contract.
    const page = readArrayQueryResult(await queryForRange(offset, offset + requested - 1));
    if (page.length > requested) {
      throw new Error("Paginated query returned more rows than requested");
    }
    rows.push(...page);
    if (page.length < requested) return rows;
  }

  // Distinguish exactly maxRows from a silently truncated larger result.
  const overflow = readArrayQueryResult(await queryForRange(maxRows, maxRows));
  if (overflow.length > 0) {
    throw httpError(413, "Слишком много записей для одного списка. Уменьшите объём данных.");
  }
  return rows;
}

module.exports = { fetchAllPages, readArrayQueryResult };
