/**
 * site.js — shared layout and site menu (no filesystem: HyperBrowser and
 * `hypermd build` both use it)
 *
 *   const menu = siteMenu([{ path: 'index.hmd', doc }, { path: 'guide/start.hmd', doc: doc2 }])
 *   const page = applyLayout(parse(layoutSource), doc2, { menu, current: 'guide/start.hmd' })
 *   renderPage(page)
 *
 * A layout (`_layout.hmd`) is a page with a `::content` slot where each page
 * goes, and optionally a `::menu`. Its relative addresses are relative to the
 * site root, so they become `/…`: the same layout works for pages in any folder.
 */

import { createNode, CONTENT_SLOT, MENU_NODE, LIST, LIST_ITEM, LINK, TEXT } from './nodes.js'
import { pageTitle } from './html.js'

/**
 * Menu entries for a site's pages, in menu order: ::page{order=N} first
 * (lowest first), then the rest by path. The root index.hmd is first unless
 * it sets an order.
 *
 * @param {{ path: string, doc: object }[]} pages - site-relative paths
 * @returns {{ url: string, title: string, path: string }[]}
 */
export function siteMenu(pages) {
  const order = p => p.doc.meta?.order ?? (p.path === 'index.hmd' ? -Infinity : Infinity)
  return [...pages]
    .sort((a, b) => order(a) - order(b) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(p => ({ url: '/' + p.path, title: pageTitle(p.doc) || p.path.replace(/\.hmd$/, ''), path: p.path }))
}

/**
 * Put a page into a layout. The layout is not changed.
 *
 * @param {object} layout - parse() of the layout
 * @param {object} page   - parse() of the page
 * @param {object} [opts]
 * @param {{ url: string, title: string }[]} [opts.menu] - fills every ::menu
 * @param {string} [opts.current] - the page's site path, marked in the menu
 * @returns {object} a document like parse()'s, with `layout: true`
 */
export function applyLayout(layout, page, opts = {}) {
  const nodes = JSON.parse(JSON.stringify(layout.nodes)) // plain data; a layout is reused for every page
  let slot = null
  walk(nodes, n => {
    if (n.type === CONTENT_SLOT && !slot) slot = n
    if (n.type === MENU_NODE) n.children = [menuList(opts.menu ?? [], opts.current)]
    else if (n.type === LINK) n.props.url = fromRoot(n.props.url)
    else if (n.props?.src != null) n.props.src = fromRoot(n.props.src)
  })
  if (!slot) nodes.push(slot = createNode(CONTENT_SLOT)) // no ::content: page goes last
  slot.children = page.nodes

  return {
    nodes,
    styles: [...layout.styles, ...page.styles],
    scripts: [...layout.scripts.map(s => s.props.src ? { ...s, props: { ...s.props, src: fromRoot(s.props.src) } } : s), ...page.scripts],
    queries: [...layout.queries, ...page.queries],
    templates: [...layout.templates, ...page.templates],
    meta: page.meta ?? {},
    layout: true,
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function menuList(menu, current) {
  const at = current == null ? null : '/' + String(current).replace(/^\//, '')
  return createNode(LIST, { ordered: false }, menu.map(item =>
    createNode(LIST_ITEM, {}, [createNode(LINK, { url: item.url, title: null, current: item.url === at }, [createNode(TEXT, { value: item.title })])])))
}

/** A relative address in the layout, made relative to the site root. */
function fromRoot(url) {
  const s = String(url)
  return /^[a-z][a-z0-9+.-]*:/i.test(s) || s.startsWith('/') || s.startsWith('#') || s === '' ? s : '/' + s.replace(/^\.\//, '')
}

function walk(nodes, fn) {
  for (const n of nodes) {
    fn(n)
    if (n.children?.length) walk(n.children, fn)
  }
}
