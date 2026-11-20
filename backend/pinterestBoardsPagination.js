const MAX_PINTEREST_BOARD_PAGES = 20;

const MALFORMED_PAGE = "Pinterest вернул страницу досок без списка";
const MALFORMED_ITEM = "Pinterest вернул доску без идентификатора";

function malformed(message, extra = {}) {
  return { ok: false, status: 502, data: { message, ...extra } };
}

/** A board the rest of the app can use: it must carry an id the customer's schedule can reference. */
function isUsableBoard(item) {
  if (!item || typeof item !== "object") return false;
  const { id } = item;
  if (typeof id === "string") return id.trim().length > 0;
  return typeof id === "number" && Number.isFinite(id);
}

async function fetchAllPinterestBoards(fetchPage, maxPages = MAX_PINTEREST_BOARD_PAGES) {
  const items = [];
  const requestedBookmarks = new Set();
  let bookmark = null;
  let lastResult = null;

  for (let page = 0; page < maxPages; page += 1) {
    if (bookmark && requestedBookmarks.has(bookmark)) {
      return malformed("Pinterest вернул повторяющийся курсор страниц досок");
    }
    if (bookmark) requestedBookmarks.add(bookmark);

    const result = await fetchPage(bookmark);
    lastResult = result;
    if (!result || !result.ok) return result || malformed("Pinterest вернул пустой ответ при загрузке досок");

    // A 200 without a list used to read as "this account has no boards": the customer saw an empty
    // board picker instead of an error, and the real cause (a changed response shape) never reached
    // support. A page whose items cannot be used is refused for the same reason - it used to become
    // a 500 from the mapping in the route, which is also the wrong answer.
    const pageData = result.data;
    if (!pageData || !Array.isArray(pageData.items)) {
      return malformed(MALFORMED_PAGE, { lastStatus: result.status });
    }
    const pageItems = pageData.items;
    if (pageItems.some((item) => !isUsableBoard(item))) {
      return malformed(MALFORMED_ITEM, { lastStatus: result.status, page: page + 1 });
    }

    items.push(...pageItems);
    bookmark = pageData.bookmark;
    if (!bookmark) return { ...result, data: { ...pageData, items } };
  }

  return {
    ok: false,
    status: 502,
    data: {
      message: `Pinterest вернул больше ${maxPages} страниц досок; список не был обрезан молча`,
      pagesFetched: maxPages,
      lastStatus: lastResult && lastResult.status,
    },
  };
}

module.exports = { MAX_PINTEREST_BOARD_PAGES, fetchAllPinterestBoards };
