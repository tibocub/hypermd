# CLAUDE.md

Guidance for any Claude Code session working in this repo.

## What this is

HyperMD is the document format and parser behind HyperBBS: Markdown plus directives
(`:::query`, `:::template`, `:::script`, styling) that describe terminal-first dynamic pages.
It is a parsing/transform library — no networking, no storage, no P2P. It turns `.hmd`
source into a node tree that HyperBBS renders via OpenTUI. It also renders that tree to HTML
(for HyperBrowser's web view) and builds static HTML sites (`hypermd build`, for GitHub Pages).

`src/`: `parser.js` (source → mdast + directives), `nodes.js` (node types),
`transformer.js` (mdast → HyperMD node tree), `resolve.js` (query/template resolution),
`template-engine.js` (interpolation), `html.js` (node tree → HTML, safe for page text),
`site.js` (`applyLayout`, `siteMenu`: shared layout and menu, no filesystem),
`build.js` + `bin/hypermd.js` (static site builder — the only code that touches the filesystem;
deliberately not exported from `index.js`), `index.js` (public API — `parse`, `interpolate`,
`renderHTML`, `renderPage`, …).

Must run on **Node and Bare** (HyperBrowser's engine). No `process` global on Bare; `fs`/`path` come
through the `imports` map in `package.json` (`bare-fs` / `bare-path`).

## Media nodes

Three node types, one per kind (`nodes.js`): `AudioNode` (`::audio[caption]{src=…}`), `VideoNode`
(`::video[…]`), and `ImageNode` (`::image[…]`, `::img[…]`, and standard `![alt](src)`).

- `src` is always kept as text — exempt from the usual number coercion of settings.
- A media directive with no `src` is still produced, with `error: 'missing-src'`, so the viewer sees
  a notice instead of nothing. Other leaf directives drop themselves when a required setting is
  missing; media deliberately does not.
- Markdown images sitting directly in a paragraph are **lifted out** of it (HyperBBS flattens
  paragraphs to one line of text, where an image would vanish). Images nested deeper, e.g. inside a
  link, stay inline.
- HyperMD never fetches media. Loading, playing and saving are the renderer's job.

Assertions: `test/media.test.js` here, and HyperBBS's
`E:\Code\P2P\HyperBBS\test\brittle\media\hypermd-media-parse.js` (run it too when changing media). Design: `E:\Code\P2P\HyperBBS\specs\001-hypersite-media\`.

## Docs-site features

- Headings always get an id from their text (`slug()` in `transformer.js`), deduplicated against
  every other id on the page. `::toc` is filled in the same pass (`linkHeadings`).
- `::page{…}` goes to `doc.meta` (title/description kept as text, like media `src`).
- GFM: only table, strikethrough, task list, footnote extensions — not the `gfm` bundle, whose
  bare-URL autolinks would change existing pages.
- Layout (`_layout.hmd` in the builder): `applyLayout` copies the layout, makes its relative
  addresses `/…`, fills `::menu`, puts the page in `::content`, and sets `doc.layout` so
  `renderPage` uses the slot as `<main>`.
- The builder only deletes files listed in `<out>/.hypermd-build` from its previous run, and only
  inside the output folder.
- HyperBBS's terminal renderer drops node types it has no mapping for (blocks and inline), so new
  node types need a mapping there to show up in the terminal.

## Tests

Real `brittle` assertions in `test/*.test.js` (parser, query/template, resolve, media, HTML, site, build).
`test/html.test.js` fails if a node type in `nodes.js` has no HTML case — add one when adding a type.

```bash
npm test           # Node
npm run test:bare  # Bare — run both
```

## Wider ecosystem

HyperMD is one of five sibling P2P projects under `E:\Code\P2P\`. **The canonical map is
[`E:\Code\P2P\hypergraph\ECOSYSTEM.md`](../hypergraph/ECOSYSTEM.md)** — read it before any
cross-project work.

Short version:

- **hypergraph** (`E:\Code\P2P\hypergraph`) — P2P graph database; the hub everything depends on.
  HyperMD does **not** depend on it.
- **HyperBBS** (`E:\Code\P2P\HyperBBS`) — terminal-first P2P browser. **The consumer of this
  project**, and currently the only one.
- **hyperDNS**, **SwarmFS** — naming and file transfer; unrelated to HyperMD.

**`HyperBBS/node_modules/hypermd` is a link to this directory.** HyperBBS declares
`"hypermd": "file:../HyperMD"`, so `npm install` there creates the link itself and it cannot be
replaced by a registry or GitHub copy. Editing `src/` here changes HyperBBS's behavior immediately,
with no publish step.
When changing the parser's output shape, check HyperBBS's `src/query-resolver.js` (imports `parse`
and `interpolate`) and re-run HyperBBS's suite.

## Direction

The format spec lives in **`HyperBBS/README.md`** (node types, style system, sandbox scripting
API), not here — that's deliberate, since the format only means anything in the context of a
renderer. Keep the two in sync when adding directives.
