# Harbor WeebCentral Source

An **experimental** English WeebCentral source plugin for Harbor's Manga reader. Version 0.1.1 adds the HTMX chapter headers required by WeebCentral and filters its broken-image placeholder.

## Install

In Harbor, open **Manga → Set up a source → Extensions** and add:

```text
https://raw.githubusercontent.com/Kirilax/harbor-weebcentral/main/repo.json
```

Available sources:

- **WeebCentral (English)** — broad English catalog.
- **MangaDex Manhwa (Korean → English)** — Korean-origin titles with English chapters on MangaDex.
- **Atsu (English Manga & Manhwa)** — a broader mixed catalog with direct page URLs, useful for additional English-translated manhwa.

## Current status

The plugin implements Harbor's `popular`, `search`, `detail`, `chapters`, `pageUrls`, and `tags` methods. Its parser and return shapes are covered by local fixture tests. WeebCentral is an HTML/HTMX source protected by changing anti-bot rules, so live operation in Harbor cannot be guaranteed and may break when WeebCentral changes markup or blocks Harbor's HTTP client.

## Development

```bash
npm run check
npm test
```

## Sources used for the port

- Harbor plugin contract and manifest structure: `SilverHazer/harbor-manga-sources`
- Current WeebCentral routes and parsing behavior: `axsddlr/weebcentral-dl`
- Atsu provider: `SilverHazer/harbor-manga-sources`

## License

MIT. This repository contains no manga or image files.
