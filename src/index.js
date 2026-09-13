/**
 * hypermd — public API
 *
 * The only entry point external consumers (HyperBBS, future static-site
 * renderers, tooling) should import from. Paths under src/* other than
 * this file are internal and may change without notice.
 *
 *   import { parse, applyStyles } from 'hypermd'
 *
 *   const doc = parse(source)
 *   //   doc.nodes    -> HyperDOM tree (renderable content)
 *   //   doc.styles   -> collected :::style blocks
 *   //   doc.scripts  -> collected :::script blocks (raw source, verbatim)
 *   //   doc._mdast   -> underlying mdast tree, for debugging
 *
 *   applyStyles(doc.nodes, doc.styles)   // mutates doc.nodes in place
 *
 * A HyperDOM node is a plain object:
 *   { type, id, props, children, _tuiRef }
 *
 * This tree is renderer-agnostic by design: it carries no openTUI or
 * HTML-specific assumptions. `_tuiRef` is just an empty slot a renderer
 * may use to cache its own internal handle.
 */

export { parse, applyStyles } from './parser.js'
export { transform } from './transformer.js'
export { resolveExternals } from './resolve.js'
export { interpolate } from './template-engine.js'

export {
  createNode,
  DIRECTIVE_MAP,

  // Layout containers
  CONTAINER_PANEL,
  CONTAINER_FORM,
  CONTAINER_COLUMNS,

  // Interactive widgets
  INPUT_NODE,
  BUTTON_NODE,
  SELECT_NODE,

  // Display effects
  MARQUEE_NODE,
  BIGTEXT_NODE,
  DIVIDER_NODE,

  // Data-driven views
  QUERY_BLOCK,
  TEMPLATE_BLOCK,

  // Meta / scripting
  SCRIPT_BLOCK,
  STYLE_BLOCK,

  // Standard markdown passthrough
  HEADING,
  PARAGRAPH,
  TEXT,
  STRONG,
  EMPHASIS,
  INLINE_CODE,
  CODE_BLOCK,
  LINK,
  LIST,
  LIST_ITEM,
  BREAK,
  COLOR_SPAN,

  // Media
  AUDIO_NODE,
  VIDEO_NODE,
  IMAGE_NODE,
} from './nodes.js'

/**
 * Namespace object for consumers who prefer `NodeTypes.BUTTON_NODE`
 * over destructured named imports (handy when type-checking or
 * building a switch statement in a renderer).
 */
export * as NodeTypes from './nodes.js'

/** Package version, kept in sync with package.json by hand for now. */
export const VERSION = '0.1.0'