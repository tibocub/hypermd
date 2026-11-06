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

  t.alike(first.pages.sort(), ['faq.html', 'guide/start.html', 'index.html'])
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
  t.alike(res.pages, ['a/one & two.html', 'index.html'])
  const index = fs.readFileSync(`${dir}/_site/index.html`, 'utf8')
  t.ok(index.includes('<a class="hmd-Link" href="a/one &amp; two.html">a/one &amp; two</a>'))
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
