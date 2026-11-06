/**
 * build.js — `hypermd build`: a static hypersite folder → a plain HTML site
 *
 *   import { build } from 'hypermd/src/build.js'
 *   build('site', 'site/_site')   // → { pages: [...], files: [...] }
 *
 * - every `*.hmd` page becomes `*.html` at the same relative path
 * - links to `*.hmd` pages are rewritten to `*.html`; links starting with
 *   `/` are made relative, so the site works under any base path
 *   (GitHub Pages serves project sites from /<repo>/)
 * - every other file (JS, CSS, media…) is copied as is
 * - `*.css` files at the site root are linked from every page
 * - `::script{src=…}` files are loaded as <script type="module">
 * - without an `index.hmd`, an `index.html` listing all pages is made
 *
 * Dotfiles, node_modules and the output folder itself are skipped. The
 * output folder is not emptied first. Separate from index.js on purpose:
 * this needs a filesystem, the parser and renderer must not.
 */

import fs from 'fs'
import path from 'path'
import { parse } from './parser.js'
import { createNode } from './nodes.js'
import { renderPage } from './html.js'

/**
 * @param {string} inDir
 * @param {string} [outDir] - default `<inDir>/_site`
 * @returns {{ pages: string[], files: string[] }} site-relative paths written
 */
export function build(inDir, outDir = path.join(inDir, '_site')) {
  if (!fs.statSync(inDir).isDirectory()) throw new Error(`not a folder: ${inDir}`)
  const skip = path.resolve(outDir)
  const sources = walk(inDir, '', skip)
  const css = sources.filter(rel => !rel.includes('/') && rel.endsWith('.css')).sort()
  const pages = []
  const files = []

  for (const rel of sources) {
    const from = path.join(inDir, rel)
    if (!rel.endsWith('.hmd')) {
      write(outDir, rel, fs.readFileSync(from))
      files.push(rel)
      continue
    }
    const up = '../'.repeat(rel.split('/').length - 1)
    const doc = parse(fs.readFileSync(from, 'utf8'))
    const html = renderPage(doc, {
      styles: css.map(c => up + c),
      scripts: doc.scripts.filter(s => s.props.src).map(s => pageHref(String(s.props.src), up)),
      href: url => pageHref(url, up),
    })
    const out = htmlPath(rel)
    write(outDir, out, html)
    pages.push(out)
  }

  if (!pages.includes('index.html')) {
    // Built as nodes, not markdown, so odd file names can't break the list
    const text = value => createNode('Text', { value })
    const items = pages.map(p => createNode('ListItem', {}, [createNode('Link', { url: p }, [text(p.replace(/\.html$/, ''))])]))
    const nodes = [createNode('Heading', { depth: 1 }, [text(path.basename(path.resolve(inDir)))]), createNode('List', {}, items)]
    write(outDir, 'index.html', renderPage({ nodes }, { styles: css }))
    pages.push('index.html')
  }

  // GitHub Pages: serve files and folders starting with `_` as they are
  write(outDir, '.nojekyll', '')
  return { pages, files }
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