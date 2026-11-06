/**
 * HyperMD transformer
 *
 * Walks an mdast AST (with directive nodes already resolved by
 * mdast-util-directive) and emits a HyperDOM tree.
 *
 * Entry point: transform(mdastRoot) → { nodes, styles, scripts }
 */

import {
  DIRECTIVE_MAP,
  createNode,
  HEADING, PARAGRAPH, TEXT, STRONG, EMPHASIS,
  INLINE_CODE, CODE_BLOCK, LINK, LIST, LIST_ITEM, BREAK,
  COLOR_SPAN, SCRIPT_BLOCK, STYLE_BLOCK, QUERY_BLOCK, TEMPLATE_BLOCK,
  AUDIO_NODE, VIDEO_NODE, IMAGE_NODE,
} from './nodes.js'

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transform a parsed mdast root into a HyperDOM document.
 *
 * @param {object} mdastRoot - the root node from mdast-util-from-markdown
 * @returns {{
 *   nodes:   object[],   // top-level HyperDOM nodes (the document body)
 *   styles:  object[],   // collected StyleBlock nodes (applied last)
 *   scripts: object[],   // collected ScriptBlock nodes (executed at mount)
 * }}
 */
export function transform(mdastRoot, source = '') {
  const ctx = {
    styles: [],
    scripts: [],
    queries: [],
    templates: [],
    source,
    definitions: collectDefinitions(mdastRoot, {}),
  }

  const nodes = mdastRoot.children
    .map(n => transformNode(n, ctx))
    .flat() // a paragraph containing images becomes several nodes
    .filter(Boolean)
    .filter(n => !isStrayFence(n))

  return { nodes, styles: ctx.styles, scripts: ctx.scripts, queries: ctx.queries, templates: ctx.templates }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Detect paragraphs that are stray closing fences (:::) from unbalanced
 * directives. micromark emits these as raw text; we drop them silently.
 */
function isStrayFence(node) {
  if (node.type !== 'Paragraph') return false
  if (node.children.length !== 1) return false
  const child = node.children[0]
  return child.type === 'Text' && child.props?.value?.trim() === ':::'
}

function transformNode(node, ctx) {
  // Directive nodes (custom HyperMD syntax)
  if (node.type === 'containerDirective') return transformContainer(node, ctx)
  if (node.type === 'leafDirective')      return transformLeaf(node, ctx)
  if (node.type === 'textDirective')      return transformInlineDirective(node, ctx)

  // Standard mdast nodes
  switch (node.type) {
    case 'heading':   return transformHeading(node, ctx)
    case 'paragraph': return transformParagraph(node, ctx)
    case 'text':      return createNode(TEXT,        { value: node.value })
    case 'strong':    return createNode(STRONG,      {}, transformChildren(node, ctx))
    case 'emphasis':  return createNode(EMPHASIS,    {}, transformChildren(node, ctx))
    case 'inlineCode':return createNode(INLINE_CODE, { value: node.value })
    case 'code':      return createNode(CODE_BLOCK,  { value: node.value, lang: node.lang ?? null })
    case 'image':     return transformImage(node)
    case 'imageReference': return transformImage(resolveReference(node, ctx))
    case 'linkReference': {
      const def = ctx.definitions[node.identifier]
      const children = transformChildren(node, ctx)
      return def ? createNode(LINK, { url: def.url, title: def.title ?? null }, children) : children
    }
    case 'link':      return createNode(LINK,        { url: node.url, title: node.title ?? null }, transformChildren(node, ctx))
    case 'list':      return createNode(LIST,        { ordered: node.ordered ?? false }, transformChildren(node, ctx))
    case 'listItem':  return createNode(LIST_ITEM,   {}, transformChildren(node, ctx))
    case 'break':     return createNode(BREAK,       {})
    case 'thematicBreak': return createNode('DividerNode', {})

    // Nodes we don't render (html passthrough, definitions, etc.)
    case 'html':
    case 'definition':
      return null

    default:
      // Unknown node: log in dev, skip silently in prod
      if (globalThis.process?.env?.HYPERMD_DEBUG) { // no `process` global on Bare
        console.warn(`[hypermd] unknown node type: ${node.type}`)
      }
      return null
  }
}

function transformChildren(node, ctx) {
  if (!node.children) return []
  return node.children.map(n => transformNode(n, ctx)).flat().filter(Boolean)
}

// ─── Directives ───────────────────────────────────────────────────────────────

function transformContainer(node, ctx) {
  const nodeType = DIRECTIVE_MAP[node.name]

  if (!nodeType) {
    console.warn(`[hypermd] unknown container directive: :::${node.name}`)
    return null
  }

  const props = parseAttributes(node.attributes ?? {})
  const children = transformChildren(node, ctx)
  const hyperNode = createNode(nodeType, props, children)

  // Pull script/style/query/template blocks out into their own collections
  if (nodeType === SCRIPT_BLOCK) {
    hyperNode.props.source = extractRawBody(node, ctx.source)
    ctx.scripts.push(hyperNode)
    return null  // scripts don't render inline
  }

  if (nodeType === STYLE_BLOCK) {
    const raw = extractRawBody(node, ctx.source)
    hyperNode.props.rules = parseStyleRules(raw)
    ctx.styles.push(hyperNode)
    return null  // styles don't render inline
  }

  if (nodeType === TEMPLATE_BLOCK) {
    // :::template body is raw HyperMD source with {{interpolation}} holes.
    // Extract verbatim (same as :::script) so markdown inside templates
    // isn't mangled by the parser — it will be re-parsed per item by the
    // template engine with real context substituted in.
    if (!props.for) {
      console.warn('[hypermd] :::template block requires a for= attribute matching a :::query block\'s as= name')
      return null
    }
    hyperNode.props.templateSource = extractRawBody(node, ctx.source)
    ctx.templates.push(hyperNode)
    // Template placeholder renders inline; resolver fills its children
    hyperNode.props._resolved = false
    return hyperNode
  }

  return hyperNode
}

function transformLeaf(node, ctx) {
  const nodeType = DIRECTIVE_MAP[node.name]

  if (!nodeType) {
    console.warn(`[hypermd] unknown leaf directive: ::${node.name}`)
    return null
  }

  if (nodeType === AUDIO_NODE || nodeType === VIDEO_NODE || nodeType === IMAGE_NODE) {
    return transformMediaLeaf(node, nodeType)
  }

  const props = parseAttributes(node.attributes ?? {})

  // Leaf query block: ::query{type=post as=posts sort=createdAt:desc limit=20}
  // All config lives in attributes — no body. Using leaf (::) rather than
  // container (:::) syntax because query blocks have no meaningful body:
  // a container form would cause the following :::template to be parsed
  // as a nested child of the query rather than a sibling.
  if (nodeType === QUERY_BLOCK) {
    if (!props.as) {
      console.warn(`[hypermd] ::query requires an as= attribute to name the result set. Attributes received: ${JSON.stringify(node.attributes)}`)
      return null
    }
    if (props.sort) {
      const [field, dir = 'asc'] = String(props.sort).split(':')
      props.sortField = field
      props.sortDir   = dir === 'desc' ? 'desc' : 'asc'
    }
    const queryNode = createNode(nodeType, props)
    queryNode.props._resolved = false
    ctx.queries.push(queryNode)
    return queryNode  // renders inline as placeholder; resolver populates children
  }

  // External script/style references: ::script{src="utils.js"} and
  // ::style{src="theme.hcss"}. These carry no body — `src` is left
  // unresolved here; a separate resolveExternals() pass (see
  // resolve.js) is responsible for fetching the referenced source and
  // filling in props.source / props.rules, since hypermd itself has no
  // concept of *how* to fetch a "file" (that's a Hypergraph key lookup
  // in HyperBBS, but could be a real filesystem read for, say, a future
  // static-site build tool — hence the pluggable resolver).
  if (nodeType === SCRIPT_BLOCK) {
    if (!props.src) {
      console.warn(`[hypermd] ::script leaf form requires a src= attribute (use :::script ... ::: for inline code). Attributes received: ${JSON.stringify(node.attributes)}`)
      return null
    }
    props.source = '' // filled in by resolveExternals()
    ctx.scripts.push(createNode(nodeType, props))
    return null
  }

  if (nodeType === STYLE_BLOCK) {
    if (!props.src) {
      console.warn(`[hypermd] ::style leaf form requires a src= attribute (use :::style ... ::: for inline rules). Attributes received: ${JSON.stringify(node.attributes)}`)
      return null
    }
    props.rules = {} // filled in by resolveExternals()
    ctx.styles.push(createNode(nodeType, props))
    return null
  }

  // Leaf directives can carry label content (the [text] part)
  const label = extractTextContent(node)
  if (label) props.label = label

  return createNode(nodeType, props)
}

function transformInlineDirective(node, ctx) {
  // :color[text]{fg=teal bg=dark}  →  ColorSpan
  const nodeType = DIRECTIVE_MAP[node.name]
  // Unknown `:word` is ordinary text ("Note:abc", ":smile"), keep it verbatim
  if (!nodeType) return createNode(TEXT, { value: sourceOf(node, ctx.source) })

  const props = parseAttributes(node.attributes ?? {})
  const children = transformChildren(node, ctx)

  // For color spans, label text may also be in children
  if (!children.length) {
    const label = extractTextContent(node)
    if (label) children.push(createNode(TEXT, { value: label }))
  }

  return createNode(nodeType, props, children)
}

// ─── Standard mdast nodes ─────────────────────────────────────────────────────

function transformHeading(node, ctx) {
  const children = transformChildren(node, ctx)
  return createNode(HEADING, { depth: node.depth }, children)
}

function transformParagraph(node, ctx) {
  // Images can't stay inside a paragraph: renderers flatten a paragraph's
  // children into one line of text, so an image left there would vanish.
  // Lift each direct image child out, splitting the paragraph around it.
  // Images nested deeper (inside a link, say) stay inline.
  if (!node.children?.some(isImage)) {
    const children = transformChildren(node, ctx)
    return createNode(PARAGRAPH, {}, children)
  }

  const out = []
  let run = []
  const flush = () => {
    const children = run.map(n => transformNode(n, ctx)).flat().filter(Boolean)
    const blank = children.every(c => c.type === TEXT && !String(c.props.value ?? '').trim())
    if (children.length && !blank) out.push(createNode(PARAGRAPH, {}, children))
    run = []
  }
  for (const child of node.children) {
    if (isImage(child)) {
      flush()
      out.push(transformNode(child, ctx))
    } else {
      run.push(child)
    }
  }
  flush()
  return out
}

// ─── Media ────────────────────────────────────────────────────────────────────

/**
 * ::audio / ::video / ::image / ::img leaf directives.
 *
 * Unlike other leaf directives, a media element with no `src` is NOT dropped:
 * it is kept with `error: 'missing-src'` so a renderer can show a notice
 * instead of silently losing it. `src` and `type` are read from the raw
 * attributes, bypassing parseAttributes' number coercion — `src=12345` must
 * stay the text "12345".
 */
function transformMediaLeaf(node, nodeType) {
  const raw = node.attributes ?? {}
  const props = parseAttributes(raw)
  const src = typeof raw.src === 'string' && raw.src.trim() !== '' ? raw.src : null

  props.src = src
  props.type = typeof raw.type === 'string' && raw.type !== '' ? raw.type : null
  props.label = extractTextContent(node) || null
  props.title = null
  props.origin = 'directive'
  props.error = src === null ? 'missing-src' : null

  return createNode(nodeType, props)
}

function isImage(node) {
  return node.type === 'image' || node.type === 'imageReference'
}

/** `![alt][ref]` → the image node shape of `![alt](url "title")`, via its [ref]: definition. */
function resolveReference(node, ctx) {
  const def = ctx.definitions[node.identifier]
  return { alt: node.alt, url: def?.url ?? null, title: def?.title ?? null }
}

/** `[ref]: url "title"` lines can sit anywhere, even after their first use. */
function collectDefinitions(node, out) {
  if (node.type === 'definition' && !(node.identifier in out)) out[node.identifier] = node
  for (const child of node.children ?? []) collectDefinitions(child, out)
  return out
}

/** The exact source text of a node, or its plain text when positions are missing. */
function sourceOf(node, source) {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  if (!source || start == null || end == null) return ':' + node.name + extractTextContent(node)
  return source.slice(start, end)
}

/** Standard markdown image: ![alt](src "title"). */
function transformImage(node) {
  const src = typeof node.url === 'string' && node.url.trim() !== '' ? node.url : null
  return createNode(IMAGE_NODE, {
    src,
    label: node.alt || null,
    title: node.title ?? null,
    type: null,
    origin: 'markdown-image',
    error: src === null ? 'missing-src' : null,
  })
}

// ─── Attribute / style helpers ────────────────────────────────────────────────

/**
 * Normalise directive attributes.
 * Plain decimal numbers are coerced; "true"/"false" strings become booleans.
 * Anything else stays text: "" (not 0), "0x10" (not 16), and `id` always,
 * so id=007 is still found as "007".
 */
function parseAttributes(raw) {
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === 'true')  { out[k] = true;  continue }
    if (v === 'false') { out[k] = false; continue }
    out[k] = k !== 'id' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v
  }
  return out
}

/**
 * Parse a :::style block's JSON content into a rules map.
 * Returns {} on parse error so a bad style block doesn't crash the document.
 *
 * The format is { "selector": { propKey: propValue } }
 * Selectors: type name ("ButtonNode"), id selector ("#my-btn"),
 *            or type+id ("panel#sidebar").
 */
function parseStyleRules(source) {
  try {
    const raw = JSON.parse(source.trim())
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      console.warn('[hypermd] :::style block must contain a JSON object')
      return {}
    }
    return raw
  } catch (e) {
    console.warn('[hypermd] failed to parse :::style block:', e.message)
    return {}
  }
}

/**
 * Extract the verbatim source text inside a container directive's body,
 * by slicing the original .hmd string using mdast position offsets.
 *
 * This bypasses markdown inline parsing entirely — critical for
 * :::script and :::style blocks, which must never have their content
 * reinterpreted as markdown (backticks, template literals, brackets,
 * etc. would otherwise be silently mangled).
 *
 * Falls back to extractTextContent() if position data is unavailable
 * (e.g. when the tree was constructed programmatically rather than parsed).
 */
function extractRawBody(node, source) {
  if (!source || !node.children?.length) return extractTextContent(node)

  const first = node.children[0]
  const last = node.children[node.children.length - 1]
  if (!first.position || !last.position) return extractTextContent(node)

  const start = first.position.start.offset
  const end = last.position.end.offset
  if (start == null || end == null) return extractTextContent(node)

  return source.slice(start, end).trim()
}

/**
 * Extract the plain text content of a directive node's children.
 * Used for ::bigtext[TEXT] labels and as a fallback when raw source
 * slicing isn't available. NOT safe for script/style bodies (see
 * extractRawBody above) since it discards non-text inline nodes
 * (inlineCode, emphasis, etc.) rather than preserving verbatim source.
 */
function extractTextContent(node) {
  if (!node.children?.length) return ''
  return node.children
    .map(c => {
      if (c.type === 'text') return c.value
      if (c.type === 'inlineCode') return c.value
      if (c.type === 'paragraph') return extractTextContent(c)
      return ''
    })
    .join('')
    .trim()
}