# hypermd

> ⚠️ **Early-stage research prototype**, extracted from [HyperBBS](https://github.com/tibocub/hyperbbs). Not published, not stable, breaking changes expected at any time.

Markdown plus a small custom directive syntax, parsed into a renderer-agnostic tree called **HyperDOM**.

This package only parses. It has no opinion on how the tree gets drawn — that's a renderer's job (HyperBBS's terminal UI today; possibly a static HTML generator later). `hypermd` doesn't import or depend on either.

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

Full list lives in `src/nodes.js`. Unknown directives are dropped with a `console.warn`, not a crash — verified by `test/brittle.hmd`.

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
- **No HTML renderer exists yet.** HyperDOM avoids baking in OpenTUI-specific assumptions where possible, but "renderer-agnostic" is a design goal here, not a proven guarantee.
- **No `:::query` / `:::template` directives yet** (declarative, scriptless data-driven views). Planned, not implemented.



---

# Liscense
MIT
