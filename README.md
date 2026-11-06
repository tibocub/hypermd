# hypermd

> ⚠️ **Early-stage research prototype**, extracted from [HyperBBS](https://github.com/tibocub/hyperbbs). Not published, not stable, breaking changes expected at any time.

Markdown plus a small custom directive syntax, parsed into a renderer-agnostic tree called **HyperDOM**.

The parser has no opinion on how the tree gets drawn — that's a renderer's job (HyperBBS's terminal UI). This package also ships one renderer of its own, **HyperDOM → HTML** (`renderHTML`, `renderPage`), and a static site builder on top of it (`hypermd build`).

---

## Why

HyperBBS needed a markdown dialect supporting custom interactive elements (buttons, inputs, scrolling marquees, ASCII art, scripting) without writing a markdown parser from scratch. This package wraps [`micromark`](https://github.com/micromark/micromark) and [`mdast-util-from-markdown`](https://github.com/syntax-tree/mdast-util-from-markdown), adds directive syntax via [`micromark-extension-directive`](https://github.com/micromark-extensions/directive) / [`mdast-util-directive`](https://github.com/syntax-tree/mdast-util-directive), and transforms the result into a small, stable node tree any renderer can walk.

It deliberately stops short of remark/unified — no plugin pipeline, no compiler, no stringifier. Source string in, HyperDOM tree out.

---

## Usage

```js
import { parse, applyStyles } from 'hypermd'

const doc = parse(`
# Hello

::button{id=submit label="Click me"}

:::style
{ "ButtonNode": { "fg": "amber", "bold": true } }
:::
`)

applyStyles(doc.nodes, doc.styles)

doc.nodes    // HyperDOM tree — renderable content
doc.styles   // collected :::style blocks (already applied above)
doc.scripts  // collected :::script blocks — raw source, verbatim
doc._mdast   // underlying mdast tree, for debugging
```

### HTML

```js
import { parse, renderHTML, renderPage } from 'hypermd'

renderHTML(doc.nodes)                                       // body fragment
renderPage(doc, { styles: ['site.css'], scripts: ['app.js'] }) // full page
```

- Safe for page text: everything is escaped, raw HTML in the source is dropped by the parser, and
  `javascript:` / `vbscript:` / `data:` links become `#`. `renderHTML` never writes `<script>`;
  `renderPage` only adds the script files you pass it. A page's `:::script` blocks are not included.
- Every element has a `hmd-<NodeType>` class (`hmd-ContainerPanel`, `hmd-ButtonNode`, …) for your CSS.
- `href: url => …` rewrites every link and media address.
- `:::style` rules are terminal props (`fg`, `bold`, …) and are **not** turned into CSS.
- An unresolved `:::template` / `::query` renders nothing.

### `hypermd build` — static site

```bash
npx hypermd build <folder> [--out <dir>]     # Node
bare bin/hypermd.js build <folder> [--out <dir>]   # Bare
```

Turns a folder of `.hmd` pages plus their files into a plain HTML site (e.g. for GitHub Pages).
Default output: `<folder>/_site`.

- `page.hmd` → `page.html`, same folders. Links to `.hmd` become `.html`; links starting with `/`
  are made relative, so the site works under any base path.
- Every other file (JS, CSS, images, audio…) is copied as is. Dotfiles and `node_modules` are skipped.
- `*.css` at the folder root are linked from every page. `::script{src=…}` becomes
  `<script type="module" src=…>`.
- No `index.hmd`? An `index.html` listing all pages is made. A `.nojekyll` is written for GitHub Pages.
- The output folder is not emptied first.

A HyperDOM node:

```js
{
  type: 'ButtonNode',      // see NodeTypes export for the full list
  id: 'submit',
  props: { label: 'Click me', fg: 'amber', bold: true },
  children: [],
  _tuiRef: null,            // empty slot — a renderer's place to cache its own handle
}
```

---

## Syntax

```md
::leafDirective[optional label]{attr=value attr2="quoted value"}

:::containerDirective{attr=value}
children, parsed as normal markdown/directives
:::

Inline :directiveName[label]{attr=value} inside a paragraph.
```

| Directive    | Node type          | Kind                                |
|--------------|--------------------|-------------------------------------|
| `:::panel`   | `ContainerPanel`   | container                           |
| `:::form`    | `ContainerForm`    | container                           |
| `:::columns` | `ContainerColumns` | container                           |
| `:::script`  | `ScriptBlock`      | container (extracted, not rendered) |
| `:::style`   | `StyleBlock`       | container (extracted, not rendered) |
| `::input`    | `InputNode`        | leaf                                |
| `::button`   | `ButtonNode`       | leaf                                |
| `::select`   | `SelectNode`       | leaf                                |
| `::marquee`  | `MarqueeNode`      | leaf                                |
| `::bigtext`  | `BigTextNode`      | leaf                                |
| `::hr`       | `DividerNode`      | leaf                                |
| `:color`     | `ColorSpan`        | inline                              |

Media: `::audio`, `::video`, `::image` / `::img` and `![alt](src)` → `AudioNode`, `VideoNode`, `ImageNode`.

Full list lives in `src/nodes.js`. Unknown `::`/`:::` directives are dropped with a `console.warn`,
not a crash. An unknown inline `:word` is kept as plain text (so `Note:abc` survives).

**Attributes:** plain decimal numbers (`limit=10`) and `true`/`false` are converted; everything
else stays text — `placeholder=""`, `hex=0x10`, and `id` always (`id=007` stays `"007"`).

---

## Syntax rules worth knowing

**Nested containers need longer fences at outer levels** (standard `micromark-extension-directive` behavior):

```md
::::panel{id=outer}
:::panel{id=inner}
content
:::
::::
```

Using `:::` at every nesting level will not close correctly — there's no way to disambiguate which fence closes which level.

**Unbalanced fences can't be reliably detected.** A stray `:::` with no opener, written right after text with no blank line, gets absorbed into the preceding paragraph rather than emitted as something filterable. There's no safe way to strip this without risking corruption of legitimate content. Authors (and any future linter) need to balance fences correctly.

**Script and style bodies are extracted verbatim**, not from markdown's parsed representation. Without this, template literals like `` `hello ${x}` `` inside `:::script` would get mangled by markdown's inline parser. `hypermd` slices the original source string directly via mdast position offsets — see `extractRawBody()` in `transformer.js`.

---

## Known limitations

- **No script execution model.** `doc.scripts` is raw source strings; what runs it and with what API is entirely up to the consumer.
- **Not parsed yet:** blockquotes, tables, strikethrough, task lists and footnotes are dropped (no GFM).



---

## Tests

```bash
npm test           # Node
npm run test:bare  # Bare
```

Real `brittle` assertions in `test/*.test.js`. `test/fixtures/site` is the sample site for the build test.

---

# Liscense
MIT
