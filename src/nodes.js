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

/** :::script — sandboxed JS block, executed at mount */
export const SCRIPT_BLOCK = 'ScriptBlock'

/** :::style — JSON prop overrides applied by id or type selector */
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
  panel:   CONTAINER_PANEL,
  form:    CONTAINER_FORM,
  columns: CONTAINER_COLUMNS,
  script:  SCRIPT_BLOCK,
  style:   STYLE_BLOCK,

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
