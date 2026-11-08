const MAX_PINTEREST_BOARD_PAGES = 20;

async function fetchAllPinterestBoards(fetchPage, maxPages = MAX_PINTEREST_BOARD_PAGES) {
  const items = [];
  const requestedBookmarks = new Set();
  let bookmark = null;
  let lastResult = null;

  for (let page = 0; page < maxPages; page += 1) {
    if (bookmark && requestedBookmarks.has(bookmark)) {
      return {
        ok: false,
        status: 502,
        data: { message: "Pinterest вернул повторяющийся курсор страниц досок" },
      };
    }
    if (bookmark) requestedBookmarks.add(bookmark);

    const result = await fetchPage(bookmark);
    lastResult = result;
    if (!result || !result.ok) return result || {
      ok: false,
      status: 502,
      data: { message: "Pinterest вернул пустой ответ при загрузке досок" },
    };

    const pageItems = result.data && Array.isArray(result.data.items) ? result.data.items : [];
    items.push(...pageItems);
    bookmark = result.data && result.data.bookmark;
    if (!bookmark) return { ...result, data: { ...result.data, items } };
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
