/**
 * html.js — HyperDOM → HTML
 *
 *   import { parse, renderHTML, renderPage } from 'hypermd'
 *
 *   renderHTML(doc.nodes)              // body fragment, a string
 *   renderPage(doc, { styles, scripts }) // full <!doctype html> page
 *
 * Safe by construction: every text and attribute value is escaped, raw
 * HTML in the source never reaches the output (the parser drops it), and
 * `javascript:` / `vbscript:` / `data:` addresses are replaced by "#".
 * renderHTML never emits <script>; renderPage only adds the script files
 * its caller lists — a page's :::script blocks are not included.
 *
 * Every element gets a `hmd-<NodeType>` class so a site's CSS can style it.
 * :::style rules (terminal props like fg/bold) are not turned into CSS.
 */

import { plainText } from './nodes.js'

export { plainText }

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ESCAPES[c])
}

/** "#" for script-running addresses; whitespace and control chars are ignored the way browsers do. */
export function safeURL(url) {
  const scheme = String(url ?? '').replace(/[\u0000- ]/g, '').toLowerCase()
  return /^(javascript|vbscript|data):/.test(scheme) ? '#' : String(url ?? '')
}

/**
 * Render HyperDOM nodes to an HTML fragment.
 *
 * @param {object[]} nodes
 * @param {object} [opts]
 * @param {(url: string) => string} [opts.href] - rewrite link and media
 *   addresses (the builder turns page.hmd into page.html this way)
 * @returns {string}
 */
export function renderHTML(nodes, opts = {}) {
  return nodes.map(n => renderNode(n, opts)).join('')
}

/**
 * Render a parsed document as a full HTML page.
 *
 * @param {object} doc - the result of parse()
 * @param {object} [opts]
 * @param {string}   [opts.title]   - defaults to ::page{title}, then the first heading's text
 * @param {string}   [opts.description] - defaults to ::page{description}
 * @param {string}   [opts.base]    - absolute site address for <base href> (the 404 page needs it)
 * @param {string[]} [opts.styles]  - stylesheet addresses for <link>
 * @param {string[]} [opts.scripts] - script addresses for <script type=module>
 * @param {string}   [opts.lang]
 * @param {(url: string) => string} [opts.href]
 */
export function renderPage(doc, opts = {}) {
  const description = opts.description ?? doc.meta?.description
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHTML(opts.title ?? pageTitle(doc))}</title>`,
    description != null && `<meta name="description" content="${escapeHTML(description)}">`,
    opts.base && `<base href="${attr(opts.base)}">`,
    ...(opts.styles ?? []).map(s => `<link rel="stylesheet" href="${attr(s)}">`),
    ...(opts.scripts ?? []).map(s => `<script type="module" src="${attr(s)}"></script>`),
  ].filter(Boolean)
  // With a layout (applyLayout), its ::content slot is the <main>
  const body = doc.layout ? renderHTML(doc.nodes, opts) : `<main class="hmd-page">\n${renderHTML(doc.nodes, opts)}\n</main>`
  return `<!doctype html>\n<html lang="${escapeHTML(opts.lang ?? 'en')}">\n<head>\n${head.join('\n')}\n</head>\n<body>\n${body}\n</body>\n</html>\n`
}

/** ::page{title}, else the first heading's text, else "". */
export function pageTitle(doc) {
  if (doc.meta?.title != null) return String(doc.meta.title)
  const heading = doc.nodes.find(n => n.type === 'Heading')
  return heading ? plainText(heading) : ''
}

// ─── Internal ─────────────────────────────────────────────────────────────────

// Footnote labels are free text; keep the id one word
function footnoteId(identifier) {
  return String(identifier ?? '').replace(/\s+/g, '-')
}

function attr(url, opts = {}) {
  return escapeHTML(safeURL(opts.href ? opts.href(url) : url))
}

function attrs(node, extra = {}) {
  const all = { id: node.id, class: `hmd-${node.type}`, ...extra }
  return Object.entries(all)
    .filter(([, v]) => v != null && v !== false)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeHTML(v)}"`))
    .join('')
}

function tag(name, node, inner, extra) {
  return `<${name}${attrs(node, extra)}>${inner}</${name}>`
}

// Only a plain color word or hex code may reach a style attribute
function cssColor(value) {
  return typeof value === 'string' && /^#?[\w-]+$/.test(value) ? value : null
}

function options(raw) {
  try {
    const list = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function media(node, opts) {
  const p = node.props
  const label = p.label ?? ''
  if (p.error || !p.src) {
    return tag('span', node, `Missing media${label ? ': ' + escapeHTML(label) : ''}`, { class: `hmd-${node.type} hmd-media-error` })
  }
  const src = attr(p.src, opts)
  if (node.type === 'ImageNode') {
    return `<img${attrs(node, { src: null, alt: label, title: p.title })} src="${src}">`
  }
  const el = node.type === 'AudioNode' ? 'audio' : 'video'
  const source = `<source src="${src}"${p.type ? ` type="${escapeHTML(p.type)}"` : ''}>`
  const fallback = `<a href="${src}">${escapeHTML(label || p.src)}</a>`
  const caption = label ? `<figcaption>${escapeHTML(label)}</figcaption>` : ''
  return tag('figure', node, `<${el} controls preload="none">${source}${fallback}</${el}>${caption}`)
}

function renderNode(node, opts) {
  const kids = () => renderHTML(node.children ?? [], opts)
  const p = node.props ?? {}

  switch (node.type) {
    case 'Heading': {
      const depth = Math.min(6, Math.max(1, Number(p.depth) || 1))
      return tag(`h${depth}`, node, kids()) + '\n'
    }
    case 'Paragraph':   return tag('p', node, kids()) + '\n'
    case 'Text':        return escapeHTML(p.value)
    case 'Strong':      return tag('strong', node, kids())
    case 'Emphasis':    return tag('em', node, kids())
    case 'InlineCode':  return tag('code', node, escapeHTML(p.value))
    case 'CodeBlock': {
      const lang = p.lang ? `language-${p.lang}` : null
      return tag('pre', node, `<code${lang ? ` class="${escapeHTML(lang)}"` : ''}>${escapeHTML(p.value)}</code>`) + '\n'
    }
    case 'Link':        return `<a${attrs(node, { title: p.title, 'aria-current': p.current ? 'page' : null })} href="${attr(p.url, opts)}">${kids()}</a>`
    case 'List':        return tag(p.ordered ? 'ol' : 'ul', node, '\n' + kids()) + '\n'
    case 'ListItem': {
      if (typeof p.checked !== 'boolean') return tag('li', node, kids()) + '\n'
      const box = `<input type="checkbox" disabled${p.checked ? ' checked' : ''}> `
      return tag('li', node, box + kids(), { class: 'hmd-ListItem hmd-task' }) + '\n'
    }
    case 'Blockquote':    return tag('blockquote', node, '\n' + kids()) + '\n'
    case 'Strikethrough': return tag('del', node, kids())
    case 'Table': {
      const [head, ...rows] = node.children ?? []
      const body = rows.map(r => renderNode(r, opts)).join('')
      return tag('table', node, `\n<thead>\n${head ? renderNode(head, opts) : ''}</thead>\n<tbody>\n${body}</tbody>\n`) + '\n'
    }
    case 'TableRow':  return tag('tr', node, kids()) + '\n'
    case 'TableCell': {
      const align = ['left', 'center', 'right'].includes(p.align) ? `text-align:${p.align}` : null
      return tag(p.header ? 'th' : 'td', node, kids(), { style: align })
    }
    case 'FootnoteReference': {
      const id = escapeHTML(footnoteId(p.identifier))
      return tag('sup', node, `<a id="fnref-${id}" href="#fn-${id}">${escapeHTML(p.number)}</a>`)
    }
    case 'Footnotes': return tag('section', node, `\n<ol>\n${kids()}</ol>\n`, { role: 'doc-endnotes' }) + '\n'
    case 'FootnoteDefinition': {
      const id = footnoteId(p.identifier)
      return tag('li', node, kids() + `<a class="hmd-backref" href="#fnref-${escapeHTML(id)}" aria-label="Back to text">↩</a>`, { id: `fn-${id}` }) + '\n'
    }

    // kind is a directive name (note, tip, warning), never page text
    case 'NoteBox':     return tag('aside', node, '\n' + kids(), { class: `hmd-NoteBox hmd-${p.kind ?? 'note'}`, role: 'note' }) + '\n'
    case 'TocNode':     return tag('nav', node, '\n' + kids(), { 'aria-label': 'Contents' }) + '\n'
    case 'MenuNode':    return tag('nav', node, '\n' + kids(), { 'aria-label': 'Site' }) + '\n'
    case 'HeaderNode':  return tag('header', node, '\n' + kids()) + '\n'
    case 'FooterNode':  return tag('footer', node, '\n' + kids()) + '\n'
    case 'ContentSlot': return tag('main', node, '\n' + kids(), { class: 'hmd-page hmd-ContentSlot' }) + '\n'
    case 'PageMeta':    return ''
    case 'Break':       return '<br>\n'
    case 'DividerNode': return `<hr${attrs(node)}>\n`
    case 'ColorSpan': {
      const style = [cssColor(p.fg) && `color:${p.fg}`, cssColor(p.bg) && `background-color:${p.bg}`].filter(Boolean).join(';')
      return tag('span', node, kids(), { style: style || null, 'data-fg': p.fg, 'data-bg': p.bg })
    }

    case 'ContainerPanel':   return tag('section', node, '\n' + kids()) + '\n'
    case 'ContainerForm':    return tag('div', node, '\n' + kids(), { role: 'form' }) + '\n'
    case 'ContainerColumns': return tag('div', node, '\n' + kids()) + '\n'

    case 'InputNode':
      return `<input${attrs(node, { name: node.id, type: p.type ?? 'text', placeholder: p.placeholder, maxlength: p.maxlength, value: p.value, 'aria-label': p.label })}>\n`
    case 'ButtonNode':
      return tag('button', node, escapeHTML(p.label ?? ''), { type: 'button' }) + '\n'
    case 'SelectNode': {
      const items = options(p.options).map((o, i) =>
        `<option value="${escapeHTML(o.value ?? o.name ?? i)}"${i === (p.selectedIndex ?? 0) ? ' selected' : ''}>${escapeHTML(o.name ?? o.value ?? '')}</option>`)
      return tag('select', node, items.join(''), { name: node.id }) + '\n'
    }
    case 'MarqueeNode': return tag('div', node, escapeHTML(p.label ?? '')) + '\n'
    case 'BigTextNode': return tag('div', node, escapeHTML(p.label ?? ''), { role: 'heading', 'aria-level': 1 }) + '\n'

    case 'AudioNode':
    case 'VideoNode':
    case 'ImageNode':
      return media(node, opts)

    // Data views show only what a resolver put in them (props._resolved);
    // an unresolved template's children are its raw {{...}} body
    case 'QueryBlock':
    case 'TemplateBlock':
      return p._resolved && node.children?.length ? tag('div', node, kids()) + '\n' : ''

    // Not rendered: collected separately by the parser
    case 'ScriptBlock':
    case 'StyleBlock':
      return ''

    // Unknown node: keep its content rather than losing it
    default:
      return kids()
  }
}
