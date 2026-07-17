/**
 * HyperMD parser
 *
 * Parses a .hmd source string into a HyperDOM document tree.
 *
 * Usage:
 *   import { parse } from './src/parser.js'
 *   const doc = parse(source)
 *   // doc.nodes    → array of HyperDOM nodes (the renderable tree)
 *   // doc.styles   → collected StyleBlock rules
 *   // doc.scripts  → collected ScriptBlock sources
 */

import { fromMarkdown } from 'mdast-util-from-markdown'
import { directiveFromMarkdown } from 'mdast-util-directive'
import { directive } from 'micromark-extension-directive'
import { transform } from './transformer.js'

/**
 * Parse a HyperMD source string.
 *
 * @param {string} source  - raw .hmd content
 * @param {object} [opts]
 * @param {string} [opts.baseKey]  - Hypergraph key of this page (for error messages)
 * @returns {{
 *   nodes:   object[],
 *   styles:  object[],
 *   scripts: object[],
 *   _mdast:  object,    // raw mdast root, useful for debugging
 * }}
 */
export function parse(source, opts = {}) {
  // 1. Parse markdown with directive extension
  const mdast = fromMarkdown(source, {
    extensions: [directive()],
    mdastExtensions: [directiveFromMarkdown()],
  })

  // 2. Transform mdast → HyperDOM (pass raw source for verbatim script/style extraction)
  const { nodes, styles, scripts, queries, templates } = transform(mdast, source)

  return {
    nodes,
    styles,
    scripts,
    queries,
    templates,
    _mdast: mdast,
  }
}

/**
 * Apply collected style rules to the HyperDOM tree (mutates in place).
 * Called after parse() — styles are extracted from the document first,
 * then applied to the full tree so forward-references work.
 *
 * Selectors supported, in match order (later matches win on conflicting
 * keys, same as CSS cascade-by-source-order — there is no specificity
 * weighting beyond that yet):
 *
 *   "ButtonNode"          - match by HyperDOM node type
 *   "h1" .. "h6"           - match Heading nodes at a specific depth
 *                            (CSS-familiar shorthand; "Heading" alone
 *                            matches all depths)
 *   "#my-id"               - match by id attribute
 *   "ButtonNode#my-id"     - type + id
 *   "h2#section-title"     - heading depth + id
 *
 * A rule's value is a plain prop-override object, with one reserved key:
 *
 *   "render": "BigTextNode"  - mount this node via a different NODE_MAP
 *                              entry than its default. This is how
 *                              "render every h1 as ASCII bigtext" is
 *                              expressed: { "h1": { "render": "BigTextNode" } }
 *                              The renderer (not hypermd) interprets this
 *                              key; hypermd only carries it through as a
 *                              regular prop so the style format stays in
 *                              one place rather than splitting "real" CSS
 *                              props from a separate renderer-override syntax.
 *
 * @param {object[]} nodes   - the nodes array from parse()
 * @param {object[]} styles  - the styles array from parse()
 */
export function applyStyles(nodes, styles) {
  // Flatten all rules from all style blocks into one map, in source order
  // (later :::style blocks override earlier ones on key conflicts, same
  // as CSS — later rules win).
  const rules = {}
  for (const styleBlock of styles) {
    Object.assign(rules, styleBlock.props.rules ?? {})
  }

  walkNodes(nodes, node => {
    const selectors = selectorsFor(node)
    for (const selector of selectors) {
      if (rules[selector]) {
        Object.assign(node.props, rules[selector])
      }
    }
  })
}

/**
 * Build the list of selectors a given node should be matched against,
 * from least to most specific. Order matters: later entries in this
 * array override earlier ones when both match (e.g. a type+id rule
 * wins over a bare type rule for the same prop).
 */
function selectorsFor(node) {
  const selectors = [node.type]

  // Heading depth shorthand: h1..h6, matched in addition to "Heading"
  if (node.type === 'Heading' && node.props?.depth >= 1 && node.props?.depth <= 6) {
    selectors.push(`h${node.props.depth}`)
  }

  if (node.id) {
    selectors.push(`#${node.id}`)
    selectors.push(`${node.type}#${node.id}`)
    if (node.type === 'Heading' && node.props?.depth >= 1 && node.props?.depth <= 6) {
      selectors.push(`h${node.props.depth}#${node.id}`)
    }
  }

  return selectors
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function walkNodes(nodes, fn) {
  for (const node of nodes) {
    fn(node)
    if (node.children?.length) walkNodes(node.children, fn)
  }
}