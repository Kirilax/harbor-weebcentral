// Experimental WeebCentral English source for Harbor.
// WeebCentral is an HTML/HTMX site and may change its markup or anti-bot rules.

const ORIGIN = "https://weebcentral.com";
const PAGE_SIZE = 32;
const TIMEOUT_MS = 30000;
const MIN_REQUEST_INTERVAL_MS = 650;

const HEADERS = {
  accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  referer: ORIGIN + "/"
};

let lastRequestTime = 0;

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function throttle() {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) await delay(MIN_REQUEST_INTERVAL_MS - elapsed);
  lastRequestTime = Date.now();
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function decodeHtml(value) {
  return text(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, function (_m, number) { return String.fromCharCode(Number(number)); })
    .replace(/\s+/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "));
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
    if (pair[1] !== undefined && pair[1] !== null && pair[1] !== "") {
      url.searchParams.append(pair[0], String(pair[1]));
    }
  }
  return url.toString();
}

async function request(url, extraHeaders, allowNotFound) {
  let finalStatus = "network";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await throttle();
    let response = null;
    try {
      response = await harbor.http(url, {
        headers: Object.assign({}, HEADERS, extraHeaders || {}),
        responseType: "text",
        timeoutMs: TIMEOUT_MS
      });
    } catch (error) {
      harbor.log("WeebCentral network error", url, String(error));
    }
    if (allowNotFound && response && response.status === 404) return null;
    if (response && response.ok && typeof response.body === "string") return response.body;
    finalStatus = response && response.status ? response.status : "network";
    if (attempt < 2 && (!response || response.status === 429 || response.status >= 500)) {
      await delay(900 * Math.pow(2, attempt));
      continue;
    }
    break;
  }
  throw new Error("WeebCentral request failed (" + finalStatus + ")");
}

function firstMatch(html, expressions) {
  for (const expression of expressions) {
    const match = expression.exec(html);
    if (match && match[1]) return decodeHtml(match[1]);
  }
  return "";
}

function attr(fragment, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch(fragment, [
    new RegExp("\\b" + escaped + "\\s*=\\s*\"([^\"]+)\"", "i"),
    new RegExp("\\b" + escaped + "\\s*=\\s*'([^']+)'", "i")
  ]);
}

function parseSeriesList(html) {
  const results = [];
  const seen = new Set();
  const linkPattern = /<a\b[^>]*href=["'](?:https?:\/\/weebcentral\.com)?\/series\/([A-Za-z0-9]+)\/([^"'?#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const id = String(match[1]).toUpperCase();
    if (seen.has(id)) continue;
    const anchor = match[0];
    const inner = match[3];
    const title = firstMatch(anchor, [
      /\btitle=["']([^"']+)["']/i,
      /\balt=["']([^"']+)["']/i
    ]) || stripTags(inner) || decodeURIComponent(match[2]).replace(/-/g, " ");
    const image = firstMatch(anchor, [
      /\b(?:data-src|src)=["']([^"']+)["']/i,
      /\bsrcset=["']([^"'\s,]+)/i
    ]);
    const item = { id: id, title: title, contentRating: "safe" };
    if (image) item.cover = absoluteUrl(image);
    results.push(item);
    seen.add(id);
  }
  return results.slice(0, PAGE_SIZE);
}

function metaContent(html, key, property) {
  const marker = property || "property";
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return firstMatch(html, [
    new RegExp("<meta[^>]+" + marker + "=[\"']" + escaped + "[\"'][^>]+content=[\"']([^\"']+)[\"']", "i"),
    new RegExp("<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+" + marker + "=[\"']" + escaped + "[\"']", "i")
  ]);
}

function parseDetail(html, id) {
  const title = metaContent(html, "og:title") || firstMatch(html, [/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, /<title>([\s\S]*?)<\/title>/i]);
  if (!title) return null;
  const item = { id: String(id).toUpperCase(), title: stripTags(title), contentRating: "safe" };
  const cover = metaContent(html, "og:image");
  const description = metaContent(html, "og:description") || metaContent(html, "description", "name");
  if (cover) item.cover = absoluteUrl(cover);
  if (description) item.description = stripTags(description);
  const status = firstMatch(html, [/Status\s*<\/[^>]+>\s*<[^>]+>([^<]+)/i, /Status\s*:?\s*<[^>]+>\s*([^<]+)/i]);
  if (status) item.status = status.toLowerCase();
  const author = firstMatch(html, [/(?:Author|Artist)s?\s*<\/[^>]+>\s*<[^>]+>([\s\S]*?)<\//i]);
  if (author) item.author = stripTags(author);
  return item;
}

function parseChapters(html, mangaId) {
  const chapters = [];
  const seen = new Set();
  const linkPattern = /(?:href=["'][^"']*\/chapters\/|value=["'])([A-Za-z0-9]+)["'][\s\S]{0,900}?(?:Chapter|Ch\.?|#)\s*([0-9]+(?:\.[0-9]+)?)/gi;
  let match;
  while ((match = linkPattern.exec(html))) {
    const chapterId = String(match[1]).toUpperCase();
    if (seen.has(chapterId)) continue;
    chapters.push({ id: chapterId, chapter: String(match[2]), pages: 0, language: "en" });
    seen.add(chapterId);
  }
  if (!chapters.length) {
    const fallback = /<span\b[^>]*>\s*(?:Chapter|Ch\.?|#)?\s*([0-9]+(?:\.[0-9]+)?)\s*<\/span>[\s\S]{0,700}?value=["']([A-Za-z0-9]+)["']/gi;
    while ((match = fallback.exec(html))) {
      const chapterId = String(match[2]).toUpperCase();
      if (!seen.has(chapterId)) chapters.push({ id: chapterId, chapter: String(match[1]), pages: 0, language: "en" });
      seen.add(chapterId);
    }
  }
  chapters.sort(function (a, b) { return (Number(b.chapter) || 0) - (Number(a.chapter) || 0); });
  return chapters;
}

function parsePageUrls(body) {
  try {
    const payload = JSON.parse(body);
    if (payload && Array.isArray(payload.images)) {
      return payload.images.map(function (item) { return absoluteUrl(item && item.src); }).filter(isMangaPageUrl);
    }
  } catch (_error) {}
  const urls = [];
  const seen = new Set();
  const imagePattern = /<(?:img|source)\b[^>]*>/gi;
  let match;
  while ((match = imagePattern.exec(body))) {
    const sourceMatch = /(?:^|\s)(?:data-src|src|srcset)\s*=\s*["']([^"']+)["']/i.exec(match[0]);
    if (!sourceMatch) continue;
    const candidate = sourceMatch[1].split(/[\s,]/)[0];
    const url = absoluteUrl(candidate);
    if (isMangaPageUrl(url) && !seen.has(url)) {
      urls.push(url);
      seen.add(url);
    }
  }
  return urls;
}

function isMangaPageUrl(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;
  return !/(?:broken[_-]?image|placeholder|loading|spinner|logo|icon|banner|avatar|advert|tracker|promo|\/static\/)/i.test(url) &&
    !/\.(?:svg|gif)(?:\?|$)/i.test(url);
}

function catalogueUrl(query, offset, popular) {
  const sort = popular ? "Popularity" : "Best Match";
  return buildUrl("/search/data", [
    ["author", ""], ["text", text(query)], ["sort", sort], ["order", "Descending"],
    ["official", "Any"], ["anime", "Any"], ["adult", "False"],
    ["display_mode", "Full Display"], ["offset", Math.max(0, Math.floor(Number(offset) || 0))]
  ]);
}

const plugin = {
  id: "weebcentral-en",
  name: "WeebCentral (English)",

  async popular(offset) {
    return parseSeriesList(await request(catalogueUrl("", offset, true)));
  },

  async search(query, offset) {
    if (!text(query)) return this.popular(offset);
    return parseSeriesList(await request(catalogueUrl(query, offset, false)));
  },

  async detail(id) {
    const html = await request(buildUrl("/series/" + encodeURIComponent(String(id).toUpperCase()), []), null, true);
    return html ? parseDetail(html, id) : null;
  },

  async chapters(id) {
    const mangaId = String(id).toUpperCase();
    const html = await request(buildUrl("/series/" + encodeURIComponent(mangaId) + "/full-chapter-list", []), { "HX-Request": "true" }, true);
    return html ? parseChapters(html, mangaId) : [];
  },

  async pageUrls(chapterId) {
    const id = String(chapterId).toUpperCase();
    const chapterUrl = buildUrl("/chapters/" + encodeURIComponent(id), []);
    const html = await request(buildUrl("/chapters/" + encodeURIComponent(id) + "/images", [
      ["is_prev", "False"], ["current_page", 1], ["reading_style", "long_strip"], ["_", id]
    ]), {
      accept: "*/*",
      referer: chapterUrl,
      "HX-Request": "true",
      "HX-Current-URL": chapterUrl
    }, true);
    return html ? parsePageUrls(html) : [];
  },

  async tags() { return []; }
};

if (typeof module !== "undefined") {
  module.exports = { parseSeriesList, parseDetail, parseChapters, parsePageUrls, catalogueUrl };
}

if (typeof harbor !== "undefined") harbor.register(plugin);
