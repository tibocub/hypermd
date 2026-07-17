/**
 * HyperMD node types — the intermediate representation between
 * the mdast AST and the openTUI reconciler.
 *
 * Every HyperDOM node has this shape:
 *   { type, id?, props, children, _tuiRef: null }
 *
 * `_tuiRef` is filled in by the reconciler when the node is mounted.
 * `id` is optional but required for script access via getElementById().
 */

// ─── Layout containers ────────────────────────────────────────────────────────

/** :::panel — styled box with optional border */
export const CONTAINER_PANEL = 'ContainerPanel'

/** :::form — layout container for input widgets */
export const CONTAINER_FORM = 'ContainerForm'

/** :::columns — horizontal split layout */
export const CONTAINER_COLUMNS = 'ContainerColumns'

// ─── Interactive widgets ──────────────────────────────────────────────────────

/** ::input — text / select / checkbox */
export const INPUT_NODE = 'InputNode'

/** ::button — pressable button */
export const BUTTON_NODE = 'ButtonNode'

/** ::select — dropdown / list selector */
export const SELECT_NODE = 'SelectNode'

// ─── Display effects ──────────────────────────────────────────────────────────

/** ::marquee — horizontally scrolling text */
export const MARQUEE_NODE = 'MarqueeNode'

/** ::bigtext — figlet-style ASCII large text */
export const BIGTEXT_NODE = 'BigTextNode'

/** ::hr — styled horizontal rule / divider */
export const DIVIDER_NODE = 'DividerNode'

// ─── Meta / scripting ─────────────────────────────────────────────────────────

/**
 * :::query — declarative graph query, runs at mount time.
 *
 *   :::query{type=post tag=sub:programming sort=createdAt:desc limit=20 as=posts}
 *
 * Props:
 *   type, tag, from, relation, sort, limit  — filter parameters
 *   as  — required; names the result set for a following :::template block
 *
 * The query produces no rendered output itself — it populates a named
 * result set that :::template{for=name} consumes. Result sets are
 * resolved before any template rendering begins, so a page can have
 * multiple independent :::query blocks.
 *
 * Read-only and static: runs once at mount time (a snapshot of the
 * data at that moment). For live-updating feeds, use :::script with
 * db.query({ live: true }) instead.
 */
export const QUERY_BLOCK = 'QueryBlock'

/**
 * :::template — renders a result set from a preceding :::query.
 *
 *   :::template{for=posts}
 *   ### {{entity.author|pubkey:short}} · {{entity.createdAt|date:relative}}
 *   {{content.body|truncate:200}}
 *   :::
 *
 * Props:
 *   for  — required; matches the `as=` name on a :::query block
 *
 * The template body is a HyperMD source string with {{variable}} and
 * {{variable|filter}} interpolation holes. It is re-parsed once per
 * query result item, with that item's context substituted in before
 * parsing. This means full HyperMD syntax (bold, panels, buttons,
 * color spans) works inside templates — each rendered item is a real
 * HyperDOM subtree, not just a text string.
 *
 * Available context per item:
 *   {{entity.id}}, {{entity.type}}, {{entity.author}}, {{entity.createdAt}}
 *   {{content.body}}, {{content.contentType}}
 *   {{tags}}              — space-separated tag string
 *   {{tag:prefix}}        — first tag with the given prefix, prefix stripped
 *   {{relations.X.count}} — count of entities with relation type X to this one
 *   {{route.id}}          — current page route parameter (for link generation)
 *   {{index}}             — 0-based position in the result set
 *
 * Filters (applied with |):
 *   |pubkey:short     — first 8 chars of a public key + …
 *   |date:relative    — "2 hours ago", "yesterday", etc.
 *   |date:iso         — full ISO 8601 string
 *   |truncate:N       — truncate to N characters with …
 *   |uppercase        — UPPER CASE
 *   |lowercase        — lower case
 *   |default:fallback — use fallback if value is empty/null
 */
export const TEMPLATE_BLOCK = 'TemplateBlock'

/**
 * :::script — sandboxed JS, executed at mount.
 *
 * Two forms:
 *   :::script              (inline — body becomes props.source directly)
 *   body...
 *   :::
 *
 *   ::script{src="utils.js"}   (external — leaf form, no body; props.src
 *                                holds the reference, props.source is left
 *                                empty until a resolver fills it in — see
 *                                resolveExternals() in resolve.js)
 */
export const SCRIPT_BLOCK = 'ScriptBlock'

/**
 * :::style — JSON prop overrides applied by id/type/heading-depth selector.
 *
 * Same two forms as ScriptBlock:
 *   :::style ... ::: (inline, props.rules parsed immediately)
 *   ::style{src="theme.hcss"}  (external, props.rules filled in later)
 */
export const STYLE_BLOCK = 'StyleBlock'

// ─── Standard markdown (passthrough) ─────────────────────────────────────────

/** Heading (h1–h6), carries depth and inline children */
export const HEADING = 'Heading'

/** Paragraph, carries inline children */
export const PARAGRAPH = 'Paragraph'

/** Inline: plain text run */
export const TEXT = 'Text'

/** Inline: strong/bold */
export const STRONG = 'Strong'

/** Inline: emphasis/italic */
export const EMPHASIS = 'Emphasis'

/** Inline: inline code */
export const INLINE_CODE = 'InlineCode'

/** Block: fenced code block */
export const CODE_BLOCK = 'CodeBlock'

/** Inline: link */
export const LINK = 'Link'

/** Block: unordered or ordered list */
export const LIST = 'List'

/** Block: list item */
export const LIST_ITEM = 'ListItem'

/** Inline: line break */
export const BREAK = 'Break'

/** Inline: color span  :color[text]{fg=teal} */
export const COLOR_SPAN = 'ColorSpan'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All recognised directive names → node type */
export const DIRECTIVE_MAP = {
  // containers (:::name)
  panel:    CONTAINER_PANEL,
  form:     CONTAINER_FORM,
  columns:  CONTAINER_COLUMNS,
  script:   SCRIPT_BLOCK,
  style:    STYLE_BLOCK,
  template: TEMPLATE_BLOCK,

  // leaves (::name)
  input:    INPUT_NODE,
  button:   BUTTON_NODE,
  select:   SELECT_NODE,
  marquee:  MARQUEE_NODE,
  bigtext:  BIGTEXT_NODE,
  hr:       DIVIDER_NODE,
  query:    QUERY_BLOCK,    // ::query (leaf) — all config in attributes, no body

  // leaves (::name)
  input:   INPUT_NODE,
  button:  BUTTON_NODE,
  select:  SELECT_NODE,
  marquee: MARQUEE_NODE,
  bigtext: BIGTEXT_NODE,
  hr:      DIVIDER_NODE,

  // inline (:name[...])
  color:   COLOR_SPAN,
}

/**
 * Create a blank HyperDOM node.
 * @param {string} type  - one of the constants above
 * @param {object} [props]
 * @param {Array}  [children]
 * @returns {object}
 */
export function createNode(type, props = {}, children = []) {
  return {
    type,
    id: props.id ?? null,
    props: { ...props },
    children,
    _tuiRef: null,
  }
}