/**
 * resolve.js
 *
 * Resolves external :::script and :::style references (the
 * ::script{src=...} / ::style{src=...} leaf forms) by fetching their
 * source through a caller-provided loader function.
 *
 * hypermd has no built-in concept of "how to fetch a file" — that's
 * deliberately left to the consumer, since the right mechanism differs
 * completely by context:
 *
 *   - HyperBBS: `src` is a relative reference resolved against the
 *     current page's Hypergraph key, read via db.get()
 *   - A future static-site build tool: `src` might be a real filesystem
 *     path, read via node:fs
 *   - A browser-based playground: `src` might be a fetch() URL
 *
 * This module only defines the *shape* of that loader and does the
 * mechanical work of calling it for each unresolved script/style node
 * and parsing the result (JSON for styles, raw text for scripts).
 *
 * Usage:
 *   const doc = parse(source)
 *   await resolveExternals(doc, async (src, kind) => {
 *     // kind is "script" or "style"
 *     return await db.get(resolveRelative(currentKey, src))
 *   })
 *   applyStyles(doc.nodes, doc.styles)
 */

/**
 * @callback ExternalLoader
 * @param {string} src - the raw `src` attribute value from the directive
 * @param {"script" | "style"} kind - what's being requested, in case a
 *   single loader function wants to branch on it (e.g. different
 *   Hypergraph spaces for scripts vs styles)
 * @returns {Promise<string>} the raw source text. For scripts, this is
 *   verbatim JS source. For styles, this is expected to be JSON text in
 *   the same shape as an inline :::style block's body.
 */

/**
 * Resolve every external script/style reference in a parsed document,
 * mutating doc.scripts / doc.styles in place by filling in
 * props.source (scripts) or props.rules (styles).
 *
 * Resolution happens concurrently (Promise.all) since each reference
 * is independent and there's no reason to serialize local graph reads.
 *
 * A failed load (loader throws, or returns invalid JSON for a style)
 * does not throw — it logs a warning and leaves that one node's
 * source/rules empty, so one broken external reference doesn't take
 * down rendering of an otherwise-fine page. This mirrors how a real
 * browser tolerates a 404 on a <script src> by just not running it.
 *
 * @param {{ scripts: object[], styles: object[] }} doc - the result of parse()
 * @param {ExternalLoader} loader
 * @returns {Promise<void>}
 */
export async function resolveExternals(doc, loader) {
  const scriptJobs = doc.scripts
    .filter(node => node.props.src && !node.props.source)
    .map(node => resolveScript(node, loader))

  const styleJobs = doc.styles
    .filter(node => node.props.src && isEmptyRules(node.props.rules))
    .map(node => resolveStyle(node, loader))

  await Promise.all([...scriptJobs, ...styleJobs])
}

async function resolveScript(node, loader) {
  try {
    node.props.source = await loader(node.props.src, 'script')
  } catch (e) {
    console.warn(`[hypermd] failed to load external script "${node.props.src}":`, e.message)
    node.props.source = ''
    node.props._loadError = e.message
  }
}

async function resolveStyle(node, loader) {
  try {
    const raw = await loader(node.props.src, 'style')
    const parsed = JSON.parse(raw.trim())
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('external style source must be a JSON object')
    }
    node.props.rules = parsed
  } catch (e) {
    console.warn(`[hypermd] failed to load external style "${node.props.src}":`, e.message)
    node.props.rules = {}
    node.props._loadError = e.message
  }
}

function isEmptyRules(rules) {
  return !rules || Object.keys(rules).length === 0
}