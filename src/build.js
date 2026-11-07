/**
 * build.js — `hypermd build`: a static hypersite folder → a plain HTML site
 *
 *   import { build } from 'hypermd/src/build.js'
 *   build('site', 'site/_site', { url: 'https://me.github.io/docs/' })
 *   // → { pages: [...], files: [...], removed: [...] }
 *
 * - every `*.hmd` page becomes `*.html` at the same relative path
 * - links to `*.hmd` pages are rewritten to `*.html`; links starting with
 *   `/` are made relative, so the site works under any base path
 *   (GitHub Pages serves project sites from /<repo>/)
 * - every other file (JS, CSS, media…) is copied as is
 * - `*.css` files at the site root are linked from every page
 * - `::script{src=…}` files are loaded as <script type="module">
 * - `_layout.hmd` at the root wraps every page (see site.js); its `::menu`
 *   lists the pages in ::page{order} order. `_*.hmd` files are not pages.
 * - without an `index.hmd`, an `index.html` listing all pages is made;
 *   without a `404.hmd`, a plain `404.html` is made
 * - with `url`, a `sitemap.xml` is written (it needs full addresses)
 * - files an earlier build wrote and this one did not are deleted; the list
 *   lives in `<out>/.hypermd-build`. Nothing else in the output is touched.
 *
 * Dotfiles, node_modules and the output folder itself are skipped. Separate
 * from index.js on purpose: this needs a filesystem, the parser and renderer
 * must not.
 */

import fs from 'fs'
import path from 'path'
import { parse } from './parser.js'
import { createNode, plainText } from './nodes.js'
import { renderPage, escapeHTML } from './html.js'
import { applyLayout, siteMenu } from './site.js'

const MANIFEST = '.hypermd-build'

/**
 * @param {string} inDir
 * @param {string} [outDir] - default `<inDir>/_site`
 * @param {object} [opts]
 * @param {string} [opts.url] - the site's public address, for sitemap.xml and the 404 page
 * @returns {{ pages: string[], files: string[], removed: string[] }} site-relative paths
 */
export function build(inDir, outDir = path.join(inDir, '_site'), opts = {}) {
  if (!fs.statSync(inDir).isDirectory()) throw new Error(`not a folder: ${inDir}`)
  const skip = path.resolve(outDir)
  const sources = walk(inDir, '', skip)
  const css = sources.filter(rel => !rel.includes('/') && rel.endsWith('.css')).sort()
  const base = opts.url ? String(opts.url).replace(/\/?$/, '/') : null
  const written = []
  const files = []
  const out = (rel, data) => { write(outDir, rel, data); written.push(rel) }

  const isPartial = rel => rel.endsWith('.hmd') && rel.split('/').pop().startsWith('_')
  const entries = [] // { path, doc }
  for (const rel of sources) {
    if (isPartial(rel)) continue
    if (rel.endsWith('.hmd')) {
      entries.push({ path: rel, doc: parse(fs.readFileSync(path.join(inDir, rel), 'utf8')) })
    } else {
      out(rel, fs.readFileSync(path.join(inDir, rel)))
      files.push(rel)
    }
  }

  // Made as nodes, not markdown, so odd file names can't break them
  const text = value => createNode('Text', { value })
  const link = (url, label) => createNode('Link', { url }, [text(label)])
  if (!entries.some(e => e.path === 'index.hmd')) {
    const items = entries.filter(e => e.path !== '404.hmd')
      .map(e => createNode('ListItem', {}, [link('/' + e.path, e.path.replace(/\.hmd$/, ''))]))
    const title = path.basename(path.resolve(inDir))
    entries.push({ path: 'index.hmd', doc: doc([createNode('Heading', { depth: 1 }, [text(title)]), createNode('List', {}, items)]) })
  }
  if (!entries.some(e => e.path === '404.hmd')) {
    entries.push({ path: '404.hmd', doc: doc([
      createNode('Heading', { depth: 1 }, [text('Page not found')]),
      createNode('Paragraph', {}, [link('/index.hmd', 'Back to the home page')]),
    ]) })
  }

  const layoutFile = path.join(inDir, '_layout.hmd')
  const layout = sources.includes('_layout.hmd') ? parse(fs.readFileSync(layoutFile, 'utf8')) : null
  const listed = entries.filter(e => e.path !== '404.hmd')
  const menu = siteMenu(listed)

  const pages = []
  for (const { path: rel, doc: page } of entries) {
    const up = '../'.repeat(rel.split('/').length - 1)
    const full = layout ? applyLayout(layout, page, { menu, current: rel }) : page
    const html = renderPage(full, {
      styles: css.map(c => up + c),
      scripts: full.scripts.filter(s => s.props.src).map(s => pageHref(String(s.props.src), up)),
      href: url => pageHref(url, up),
      // GitHub Pages serves 404.html at any depth: its relative links need the site root
      base: rel === '404.hmd' && base ? base : undefined,
    })
    out(htmlPath(rel), html)
    pages.push(htmlPath(rel))
  }

  if (base) {
    const loc = rel => base + encodeURI(htmlPath(rel).replace(/(^|\/)index\.html$/, '$1'))
    const urls = menu.map(m => `<url><loc>${escapeHTML(loc(m.path))}</loc></url>`)
    out('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`)
  }

  // GitHub Pages: serve files and folders starting with `_` as they are
  out('.nojekyll', '')
  const removed = removeStale(outDir, written)
  write(outDir, MANIFEST, JSON.stringify(written, null, 1))
  return { pages, files, removed }
}

/** Rewrite a site address for the built site; anything with a scheme is left alone. */
export function pageHref(url, up = '') {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#')) return url
  const [, file, rest] = url.match(/^([^?#]*)(.*)$/)
  const target = file.startsWith('/') ? up + file.slice(1) : file
  return (target.endsWith('.hmd') ? htmlPath(target) : target) + rest
}

function htmlPath(rel) {
  return rel.replace(/\.hmd$/, '.html')
}

function doc(nodes) {
  return { nodes, styles: [], scripts: [], queries: [], templates: [], meta: { title: plainText(nodes[0]) } }
}

/**
 * Delete what the previous build wrote (per its manifest) and this one did
 * not, plus folders that leaves empty. Only paths inside outDir are touched.
 */
function removeStale(outDir, written) {
  const root = path.resolve(outDir)
  let before = []
  try {
    before = JSON.parse(fs.readFileSync(path.join(outDir, MANIFEST), 'utf8'))
  } catch {}
  if (!Array.isArray(before)) return []
  const keep = new Set(written)
  const removed = []
  for (const rel of before) {
    if (typeof rel !== 'string' || keep.has(rel)) continue
    const file = path.resolve(root, ...rel.split('/'))
    if (!file.startsWith(root + path.sep)) continue // a hand-edited manifest can't reach outside
    try {
      if (!fs.lstatSync(file).isFile()) continue
      fs.unlinkSync(file)
      removed.push(rel)
    } catch {
      continue // already gone
    }
    for (let dir = path.dirname(file); dir.startsWith(root + path.sep); dir = path.dirname(dir)) {
      try { fs.rmdirSync(dir) } catch { break } // not empty
    }
  }
  return removed
}

/** Site-relative file paths, always with `/`. */
function walk(root, rel, skip) {
  const out = []
  for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const child = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      if (path.resolve(root, child) !== skip) out.push(...walk(root, child, skip))
    } else {
      out.push(child)
    }
  }
  return out
}

function write(outDir, rel, data) {
  const to = path.join(outDir, ...rel.split('/'))
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.writeFileSync(to, data)
}
