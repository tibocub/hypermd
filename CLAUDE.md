# CLAUDE.md

Guidance for any Claude Code session working in this repo.

## What this is

HyperMD is the document format and parser behind HyperBBS: Markdown plus directives
(`:::query`, `:::template`, `:::script`, styling) that describe terminal-first dynamic pages.
It is a **pure parsing/transform library** — no networking, no storage, no P2P. It turns `.hmd`
source into a node tree that HyperBBS renders via OpenTUI.

`src/`: `parser.js` (source → mdast + directives), `nodes.js` (node types),
`transformer.js` (mdast → HyperMD node tree), `resolve.js` (query/template resolution),
`template-engine.js` (interpolation), `index.js` (public API — `parse`, `interpolate`, …).

## ⚠ There are no real tests

`test/*.js` are **probe scripts, not assertions**. They `console.log` parser output and report
`0/0 asserts`. `npm test` runs them purely as a crash-level smoke check — **a green run does not
mean the output is correct.** Do not treat passing tests here as evidence of anything beyond
"it didn't throw."

Writing real `brittle` assertions is the highest-value open task in this repo. If you change
parser or transformer behavior, add actual assertions for what you changed rather than extending
the console.log style.

```bash
npm test     # smoke only (see above)
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

**`HyperBBS/node_modules/hypermd` is a symlink to this directory.** Editing `src/` here changes
HyperBBS's behavior immediately, with no publish step — but HyperBBS declares `"hypermd": ">=0.0.1"`,
an unbounded range, so a plain `npm install` there could replace the symlink with a registry copy.
When changing the parser's output shape, check HyperBBS's `src/query-resolver.js` (imports `parse`
and `interpolate`) and re-run HyperBBS's suite.

## Direction

The format spec lives in **`HyperBBS/README.md`** (node types, style system, sandbox scripting
API), not here — that's deliberate, since the format only means anything in the context of a
renderer. Keep the two in sync when adding directives.
