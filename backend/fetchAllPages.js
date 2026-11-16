"use strict";

const { httpError } = require("./validate");

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
    const { data, error } = await queryForRange(offset, offset + requested - 1);
    if (error) throw error;
    const page = Array.isArray(data) ? data : [];
    if (page.length > requested) {
      throw new Error("Paginated query returned more rows than requested");
    }
    rows.push(...page);
    if (page.length < requested) return rows;
  }

  // Distinguish exactly maxRows from a silently truncated larger result.
  const { data: overflow, error: overflowError } = await queryForRange(maxRows, maxRows);
  if (overflowError) throw overflowError;
  if (Array.isArray(overflow) && overflow.length > 0) {
    throw httpError(413, "Слишком много записей для одного списка. Уменьшите объём данных.");
  }
  return rows;
}

module.exports = { fetchAllPages };
