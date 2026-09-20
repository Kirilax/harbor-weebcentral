const assert = require("assert");
const parser = require("../weebcentral.plugin.js");

const searchHtml = '<a href="/series/01ABC/My-Series" title="My Series"><img src="/covers/a.jpg"></a>';
const list = parser.parseSeriesList(searchHtml);
assert.equal(list.length, 1);
assert.equal(list[0].id, "01ABC");
assert.equal(list[0].title, "My Series");
assert.equal(list[0].cover, "https://weebcentral.com/covers/a.jpg");

const detailHtml = '<meta property="og:title" content="My Series"><meta property="og:image" content="https://cdn.example/cover.jpg"><meta name="description" content="A story.">';
const detail = parser.parseDetail(detailHtml, "01abc");
assert.equal(detail.id, "01ABC");
assert.equal(detail.title, "My Series");
assert.equal(detail.description, "A story.");

const chapterHtml = '<a href="/chapters/CHAP02">Chapter 2</a><a href="/chapters/CHAP01">Chapter 1</a>';
const chapters = parser.parseChapters(chapterHtml, "01ABC");
assert.deepEqual(chapters.map(x => x.chapter), ["2", "1"]);

const pagesJson = JSON.stringify({images:[{src:"https://cdn.example/1.jpg"},{src:"/pages/2.jpg"}]});
assert.deepEqual(parser.parsePageUrls(pagesJson), ["https://cdn.example/1.jpg", "https://weebcentral.com/pages/2.jpg"]);

console.log("All parser and contract-shape tests passed.");
