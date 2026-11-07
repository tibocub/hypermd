// Run from the repo root (npm test does): paths below are relative to it
import test from 'brittle'
import fs from 'fs'
import { build, pageHref } from '../src/build.js'

const site = 'test/fixtures/site'
const out = 'test/fixtures/site/_site' // inside the site on purpose: must be skipped
const read = rel => fs.readFileSync(`${out}/${rel}`, 'utf8')

test('build: sample site', t => {
  fs.rmSync(out, { recursive: true, force: true })
  fs.writeFileSync(`${site}/.secret`, 'x')
  const first = build(site, out)
  const again = build(site, out)
  t.alike(again, first, 'rebuilding over the output gives the same result')

  t.alike(first.pages.sort(), ['404.html', 'faq.html', 'guide/start.html', 'index.html'])
  t.alike(first.files.sort(), ['app.js', 'media/logo.png', 'media/theme.mp3', 'site.css'])
  t.absent(fs.existsSync(`${out}/.secret`), 'dotfiles are not published')
  fs.rmSync(`${site}/.secret`)
  t.absent(fs.existsSync(`${out}/_site`), 'output folder is not copied into itself')
  t.ok(fs.existsSync(`${out}/.nojekyll`))
  t.is(read('media/logo.png'), 'PNG')

  const index = read('index.html')
  t.ok(index.includes('<title>Docs home</title>'))
  t.ok(index.includes('<link rel="stylesheet" href="site.css">'))
  t.ok(index.includes('<script type="module" src="app.js"></script>'))
  t.ok(index.includes('href="guide/start.html#install"'), 'page link + anchor')
  t.ok(index.includes('href="faq.html"'), 'root-absolute link made relative')
  t.ok(index.includes('href="https://example.org"'))
  t.ok(index.includes('href="hyper://abc"'))
  t.ok(index.includes('<img class="hmd-ImageNode" alt="Logo" src="media/logo.png">'))
  t.ok(index.includes('<source src="media/theme.mp3">'))

  const start = read('guide/start.html')
  t.ok(start.includes('<link rel="stylesheet" href="../site.css">'), 'css relative to page depth')
  t.ok(start.includes('href="../index.html"'))
  t.ok(start.includes('href="../faq.html"'))
  t.ok(start.includes('src="../media/logo.png"'))

  t.ok(read('faq.html').includes('href="index.html"'))
  fs.rmSync(out, { recursive: true, force: true })
})

test('build: makes an index page when the site has none', t => {
  const dir = 'test/fixtures/noindex-tmp'
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(`${dir}/a`, { recursive: true })
  fs.writeFileSync(`${dir}/a/one & two.hmd`, '# One')
  const res = build(dir, `${dir}/_site`)
  t.alike(res.pages, ['a/one & two.html', 'index.html', '404.html'])
  const index = fs.readFileSync(`${dir}/_site/index.html`, 'utf8')
  t.ok(index.includes('<a class="hmd-Link" href="a/one &amp; two.html">a/one &amp; two</a>'))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('build: layout, menu order, 404, sitemap', t => {
  const dir = 'test/fixtures/layout-tmp'
  const outDir = `${dir}/_site`
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(`${dir}/guide`, { recursive: true })
  const files = {
    '_layout.hmd': `:::header
[Home](index.hmd) ![Logo](logo.png)

::menu
:::

::content

:::footer
Footer
:::`,
    '_partial.hmd': '# not a page',
    'index.hmd': '# Welcome',
    'guide/start.hmd': `::page{title="Get started" description="First steps" order=1}

# Start

::toc

## Install

See [faq](/faq.hmd#why).`,
    'faq.hmd': `::page{order=2}

# FAQ

## Why`,
    'about me.hmd': '# About',
    'logo.png': 'PNG',
  }
  for (const [rel, data] of Object.entries(files)) fs.writeFileSync(`${dir}/${rel}`, data)

  const res = build(dir, outDir, { url: 'https://me.github.io/docs' })
  t.alike(res.pages.sort(), ['404.html', 'about me.html', 'faq.html', 'guide/start.html', 'index.html'], '_*.hmd are not pages')
  t.absent(fs.existsSync(`${outDir}/_layout.hmd`) || fs.existsSync(`${outDir}/_partial.html`))

  const start = fs.readFileSync(`${outDir}/guide/start.html`, 'utf8')
  t.ok(start.includes('<title>Get started</title>'))
  t.ok(start.includes('<meta name="description" content="First steps">'))
  t.ok(start.includes('<header class="hmd-HeaderNode">') && start.includes('<footer class="hmd-FooterNode">'))
  t.ok(start.includes('href="../index.html">Home'), 'layout link relative to the page')
  t.ok(start.includes('src="../logo.png"'))
  t.ok(start.includes('href="../faq.html#why"'), 'page#section link')
  t.ok(start.includes('<h2 id="install"') && start.includes('href="#install"'), 'toc')
  t.is(start.match(/<main/g).length, 1)
  const nav = start.slice(start.indexOf('<nav class="hmd-MenuNode"'), start.indexOf('</nav>'))
  t.alike([...nav.matchAll(/>([^<>]+)<\/a>/g)].map(m => m[1]), ['Welcome', 'Get started', 'FAQ', 'About'], 'menu: index, then order, then path')
  t.ok(nav.includes('aria-current="page" href="../guide/start.html"'))
  t.absent(nav.includes('404'), '404 not in the menu')

  const notFound = fs.readFileSync(`${outDir}/404.html`, 'utf8')
  t.ok(notFound.includes('<title>Page not found</title>'))
  t.ok(notFound.includes('<base href="https://me.github.io/docs/">'), '404 links work at any depth')
  t.ok(notFound.includes('href="index.html"'))

  const sitemap = fs.readFileSync(`${outDir}/sitemap.xml`, 'utf8')
  t.ok(sitemap.startsWith('<?xml'))
  t.alike([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]), [
    'https://me.github.io/docs/', 'https://me.github.io/docs/guide/start.html',
    'https://me.github.io/docs/faq.html', 'https://me.github.io/docs/about%20me.html',
  ])

  t.alike(build(dir, outDir).removed, ['sitemap.xml'], 'no url: no sitemap, the old one is removed')
  t.absent(fs.existsSync(`${outDir}/sitemap.xml`))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('build: removes only files an earlier build wrote', t => {
  const dir = 'test/fixtures/clean-tmp'
  const outDir = `${dir}/_site`
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(`${dir}/old/deep`, { recursive: true })
  fs.writeFileSync(`${dir}/index.hmd`, '# Home')
  fs.writeFileSync(`${dir}/old/deep/page.hmd`, '# Old')
  fs.writeFileSync(`${dir}/old/deep/pic.png`, 'PNG')
  build(dir, outDir)
  t.ok(fs.existsSync(`${outDir}/old/deep/page.html`))

  fs.writeFileSync(`${outDir}/mine.txt`, 'not from the build')
  fs.mkdirSync(`${outDir}/old/keep`, { recursive: true })
  fs.writeFileSync(`${outDir}/old/keep/x.txt`, 'mine too')
  fs.writeFileSync(`${dir}/outside.txt`, 'outside')
  // a hand-edited manifest pointing outside the output folder is ignored
  const manifest = JSON.parse(fs.readFileSync(`${outDir}/.hypermd-build`, 'utf8'))
  fs.writeFileSync(`${outDir}/.hypermd-build`, JSON.stringify([...manifest, '../outside.txt', '../index.hmd', 'mine.txt/..', 42]))

  fs.rmSync(`${dir}/old/deep`, { recursive: true })
  const res = build(dir, outDir)
  t.alike(res.removed.sort(), ['old/deep/page.html', 'old/deep/pic.png'])
  t.absent(fs.existsSync(`${outDir}/old/deep`), 'emptied folder removed')
  t.ok(fs.existsSync(`${outDir}/old/keep/x.txt`), 'folder with other files kept')
  t.ok(fs.existsSync(`${outDir}/mine.txt`), 'unknown file kept')
  t.ok(fs.existsSync(`${dir}/outside.txt`) && fs.existsSync(`${dir}/index.hmd`), 'nothing outside touched')
  t.ok(fs.existsSync(`${outDir}/index.html`))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('build: not a folder throws', t => {
  t.exception(() => build('test/fixtures/site/faq.hmd'))
})

test('pageHref', t => {
  t.is(pageHref('a.hmd'), 'a.html')
  t.is(pageHref('a.hmd?x=1#y'), 'a.html?x=1#y')
  t.is(pageHref('/a/b.hmd', '../../'), '../../a/b.html')
  t.is(pageHref('/img.png', '../'), '../img.png')
  t.is(pageHref('#top'), '#top')
  t.is(pageHref('hyper://k/a.hmd'), 'hyper://k/a.hmd', 'other schemes untouched')
  t.is(pageHref('//cdn.x/a.hmd'), '//cdn.x/a.hmd')
})
