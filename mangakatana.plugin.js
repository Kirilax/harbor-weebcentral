// MangaKatana English manga/manhwa source for Harbor.
// HTML parser based on MangaKatana's current public pages (verified 2026-09-20).

const ORIGIN = "https://mangakatana.com";
const PAGE_SIZE = 40;
const TIMEOUT_MS = 30000;
const MIN_REQUEST_INTERVAL_MS = 650;
const HEADERS = {
  accept: "text/html,application/xhtml+xml,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  referer: ORIGIN + "/"
};

let lastRequestTime = 0;

function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function throttle() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) await delay(MIN_REQUEST_INTERVAL_MS - elapsed);
  lastRequestTime = Date.now();
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeHtml(value) {
  return clean(String(value || ""))
    .replace(/&amp;/g, "&").replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function (_m, n) { return String.fromCharCode(Number(n)); })
    .replace(/\s+/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, " "));
}

function absoluteUrl(value) {
  const source = decodeHtml(value);
  if (!source) return "";
  if (/^https?:\/\//i.test(source)) return source;
  if (source.indexOf("//") === 0) return "https:" + source;
  return ORIGIN + (source.charAt(0) === "/" ? source : "/" + source);
}

function buildUrl(path, params) {
  const url = new URL(path, ORIGIN);
  for (const pair of params || []) {
    if (pair[1] !== undefined && pair[1] !== null && pair[1] !== "") url.searchParams.append(pair[0], String(pair[1]));
  }
  return url.toString();
}

async function request(url, allowNotFound) {
  let status = "network";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await throttle();
    let response = null;
    try {
      response = await harbor.http(url, { headers: HEADERS, responseType: "text", timeoutMs: TIMEOUT_MS });
    } catch (error) {
      harbor.log("MangaKatana network error", url, String(error));
    }
    if (allowNotFound && response && response.status === 404) return null;
    if (response && response.ok && typeof response.body === "string") return response.body;
    status = response && response.status ? response.status : "network";
    if (attempt < 2 && (!response || response.status === 429 || response.status >= 500)) {
      await delay(1000 * Math.pow(2, attempt));
      continue;
    }
    break;
  }
  throw new Error("MangaKatana request failed (" + status + ")");
}

function firstMatch(html, expressions) {
  for (const expression of expressions) {
    const match = expression.exec(html);
    if (match && match[1]) return decodeHtml(match[1]);
  }
  return "";
}

function encodeSeriesId(url) {
  const match = /\/manga\/([^/?#]+\.\d+)/i.exec(url);
  return match ? match[1] : "";
}

function seriesUrl(id) {
  return ORIGIN + "/manga/" + encodeURIComponent(String(id)).replace(/%2E/gi, ".");
}

function parseSeriesList(html) {
  const results = [];
  const seen = new Set();
  const itemPattern = /<div\b[^>]*class=["'][^"']*\bitem\b[^"']*["'][^>]*data-id=["']\d+["'][^>]*>([\s\S]*?)(?=<div\b[^>]*class=["'][^"']*\bitem\b|<div\b[^>]*class=["'][^"']*\bpager\b|$)/gi;
  let match;
  while ((match = itemPattern.exec(html)) && results.length < PAGE_SIZE) {
    const block = match[1];
    const href = firstMatch(block, [/<h3\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["']/i]);
    const id = encodeSeriesId(href);
    if (!id || seen.has(id)) continue;
    const title = firstMatch(block, [/<h3\b[^>]*class=["'][^"']*\btitle\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*>([\s\S]*?)<\/a>/i]);
    if (!title) continue;
    const image = firstMatch(block, [/<source\b[^>]*srcset=["']([^"']+)["']/i, /<img\b[^>]*src=["']([^"']+)["']/i]);
    const item = { id: id, title: stripTags(title), contentRating: "safe" };
    if (image) item.cover = absoluteUrl(image.split(/[\s,]/)[0]);
    const status = firstMatch(block, [/<div\b[^>]*class=["'][^"']*\bstatus\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i]);
    if (status) item.status = stripTags(status).toLowerCase();
    results.push(item);
    seen.add(id);
  }
  return results;
}

function parseDetail(html, id) {
  const title = firstMatch(html, [/<h1\b[^>]*class=["'][^"']*\bheading\b[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i, /<title>([\s\S]*?)<\/title>/i]);
  if (!title) return null;
  const item = { id: String(id), title: stripTags(title).replace(/\s*-\s*MangaKatana.*$/i, ""), contentRating: "safe" };
  const cover = firstMatch(html, [/<div\b[^>]*class=["'][^"']*\bcover\b[^"']*["'][^>]*>[\s\S]*?<img\b[^>]*src=["']([^"']+)["']/i]);
  const description = firstMatch(html, [/<div\b[^>]*class=["'][^"']*\bsummary\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i]);
  const authors = [];
  const authorPattern = /<a\b[^>]*class=["'][^"']*\bauthor\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let author;
  while ((author = authorPattern.exec(html))) {
    const name = stripTags(author[1]);
    if (name && authors.indexOf(name) === -1) authors.push(name);
  }
  if (cover) item.cover = absoluteUrl(cover);
  if (description) item.description = stripTags(description);
  if (authors.length) item.author = authors.join(", ");
  const status = firstMatch(html, [/<div\b[^>]*class=["'][^"']*\bvalue\s+status\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i]);
  if (status) item.status = stripTags(status).toLowerCase();
  return item;
}

function chapterNumber(name, href) {
  const fromName = /(?:chapter|ch\.?|episode)\s*([0-9]+(?:\.[0-9]+)?)/i.exec(name);
  if (fromName) return fromName[1];
  const fromUrl = /\/c([0-9]+(?:\.[0-9]+)?)(?:[/?#]|$)/i.exec(href);
  return fromUrl ? fromUrl[1] : null;
}

function parseChapters(html) {
  const chapters = [];
  const seen = new Set();
  const pattern = /<tr\b[^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+\/c[^"']*)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const href = absoluteUrl(match[1]);
    if (seen.has(href)) continue;
    const name = stripTags(match[2]);
    chapters.push({ id: href, chapter: chapterNumber(name, href), title: name, pages: 0, language: "en" });
    seen.add(href);
  }
  return chapters;
}

function parsePageUrls(html) {
  // The reader assigns its full-resolution array to the variable referenced by data-src.
  const arrayName = firstMatch(html, [/data-src\s*=\s*["']\s*["']\s*,\s*([A-Za-z_$][\w$]*)/i, /data-src["']\s*,\s*([A-Za-z_$][\w$]*)/i]);
  let source = "";
  if (arrayName) {
    const escaped = arrayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    source = firstMatch(html, [new RegExp("(?:var|let|const)\\s+" + escaped + "\\s*=\\s*\\[([\\s\\S]*?)\\]", "i")]);
  }
  if (!source) {
    // Fallback: choose the largest JavaScript array containing MangaKatana image hosts.
    const candidates = html.match(/(?:var|let|const)\s+[A-Za-z_$][\w$]*\s*=\s*\[[\s\S]*?\]/gi) || [];
    candidates.sort(function (a, b) { return b.length - a.length; });
    source = candidates.find(function (value) { return /https?:\\?\/\\?\/[^"']*mangakatana\.com/i.test(value); }) || "";
  }
  const urls = [];
  const seen = new Set();
  const urlPattern = /["'](https?:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = urlPattern.exec(source))) {
    const url = decodeHtml(match[1]).replace(/\\\//g, "/");
    if (!seen.has(url)) { urls.push(url); seen.add(url); }
  }
  return urls;
}

function cataloguePath(offset) {
  return "/page/" + (Math.floor(Math.max(0, Number(offset) || 0) / PAGE_SIZE) + 1);
}

const plugin = {
  id: "mangakatana-en",
  name: "MangaKatana Manhwa (English)",

  async popular(offset, tagId) {
    const page = Math.floor(Math.max(0, Number(offset) || 0) / PAGE_SIZE) + 1;
    const genre = tagId === "webtoon" ? "webtoon" : "manhwa";
    const path = "/genre/" + genre + (page > 1 ? "/page/" + page : "");
    return parseSeriesList(await request(buildUrl(path, [])));
  },

  async search(query, offset) {
    const term = clean(query);
    if (!term) return this.popular(offset);
    return parseSeriesList(await request(buildUrl(cataloguePath(offset), [["search", term], ["search_by", "book_name"]])));
  },

  async detail(id) {
    const html = await request(seriesUrl(id), true);
    return html ? parseDetail(html, id) : null;
  },

  async chapters(id) {
    const html = await request(seriesUrl(id), true);
    return html ? parseChapters(html) : [];
  },

  async pageUrls(chapterId) {
    const url = absoluteUrl(String(chapterId));
    const html = await request(url, true);
    return html ? parsePageUrls(html) : [];
  },

  async tags() {
    return [{ id: "webtoon", name: "Webtoon", group: "Format" }];
  }
};

if (typeof module !== "undefined") module.exports = { parseSeriesList, parseDetail, parseChapters, parsePageUrls };
if (typeof harbor !== "undefined") harbor.register(plugin);
