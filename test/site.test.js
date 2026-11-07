// Docs-site features: heading anchors, ::toc, ::page, GFM parts, layout and menu
import test from 'brittle'
import { parse, renderPage, renderHTML, applyLayout, siteMenu, slug, applyStyles } from '../src/index.js'

const headings = doc => doc.nodes.filter(n => n.type === 'Heading').map(n => n.id)

test('headings get stable, unique ids', t => {
  const doc = parse('# Get started!\n\n## Get started\n\n## Get started\n\n## `npm` & Bare\n\n## Ünïcode Çafé\n\n## ???\n\n::button[x]{id=install}\n\n## Install')
  t.alike(headings(doc), ['get-started', 'get-started-1', 'get-started-2', 'npm-bare', 'ünïcode-çafé', 'section', 'install-1'])
  t.is(slug('  Hello,   World  '), 'hello-world')
})

test('heading ids work as style selectors and #section links', t => {
  const doc = parse('## Setup\n\nSee [setup](#setup) or [the guide](guide.hmd#install).\n\n:::style\n{ "h2#setup": { "fg": "red" } }\n:::')
  applyStyles(doc.nodes, doc.styles)
  t.is(doc.nodes[0].props.fg, 'red')
  const out = renderHTML(doc.nodes)
  t.ok(out.includes('<h2 id="setup"'))
  t.ok(out.includes('href="#setup"'))
  t.ok(out.includes('href="guide.hmd#install"'))
})

test('::toc lists h2–h3 by default, depth= changes it', t => {
  const src = '# T\n\n## A\n\n### B\n\n#### C\n\n## D'
  const links = doc => JSON.stringify(doc.nodes[0]).match(/"url":"[^"]+"/g)
  t.alike(links(parse('::toc\n\n' + src)), ['"url":"#a"', '"url":"#b"', '"url":"#d"'])
  t.alike(links(parse('::toc{depth=4}\n\n' + src)), ['"url":"#a"', '"url":"#b"', '"url":"#c"', '"url":"#d"'])
  t.is(parse('::toc').nodes[0].children[0].children.length, 0, 'no headings: empty list')
})

test('::page sets doc.meta; title and description stay text', t => {
  const doc = parse('::page{title=2024 description="Short & sweet" order=3}\n\n# Heading')
  t.alike(doc.meta, { title: '2024', description: 'Short & sweet', order: 3 })
  t.is(doc.nodes.length, 1, 'not rendered')
  t.alike(parse('x').meta, {})
})

test('renderPage: title and description from ::page', t => {
  const out = renderPage(parse(`::page{title="Install <HyperBrowser>" description='How to "install"'}

# Other`))
  t.ok(out.includes('<title>Install &lt;HyperBrowser&gt;</title>'))
  t.ok(out.includes('<meta name="description" content="How to &quot;install&quot;">'))
  t.absent(renderPage(parse('# T')).includes('name="description"'))
  t.ok(renderPage(parse('# T'), { base: 'https://x.io/d/' }).includes('<base href="https://x.io/d/">'))
  t.ok(renderPage(parse('# T'), { base: 'javascript:x' }).includes('<base href="#">'), 'base is a safe url too')
})

test('GFM: table, strikethrough, task list, footnotes', t => {
  const doc = parse('| a | b |\n|:-|-:|\n| ~~x~~ | y |\n\n- [x] done\n- [ ] todo\n\nOne[^b] two[^a] again[^b] missing[^zz]\n\n[^a]: A[^c]\n[^b]: B\n[^c]: C\n[^unused]: U')
  const [table, list, para, notes] = doc.nodes
  t.is(table.type, 'Table')
  t.alike(table.props.align, ['left', 'right'])
  t.alike(table.children[0].children.map(c => c.props.header), [true, true])
  t.is(table.children[1].children[0].children[0].type, 'Strikethrough')
  t.alike(list.children.map(i => i.props.checked), [true, false])
  t.alike(para.children.filter(c => c.type === 'FootnoteReference').map(c => c.props.number), [1, 2, 1])
  t.ok(para.children.some(c => c.type === 'Text' && c.props.value.includes('[^zz]')), 'undefined footnote stays text')
  t.is(notes.type, 'Footnotes')
  t.alike(notes.children.map(d => [d.props.identifier, d.props.number]), [['b', 1], ['a', 2], ['c', 3]], 'by first use, unused dropped')
  t.is(doc.nodes.length, 4, 'footnotes come last, once')
})

test('bare URLs are not turned into links (no GFM autolink)', t => {
  t.absent(JSON.stringify(parse('see https://x.org now').nodes).includes('"Link"'))
})

test(':::note / :::tip / :::warning', t => {
  t.alike(parse(':::note\na\n:::\n\n:::tip\nb\n:::\n\n:::warning\nc\n:::').nodes.map(n => [n.type, n.props.kind]),
    [['NoteBox', 'note'], ['NoteBox', 'tip'], ['NoteBox', 'warning']])
})

test('siteMenu: ::page order first, then by path; root index first by default', t => {
  const page = (path, src) => ({ path, doc: parse(src) })
  const menu = siteMenu([
    page('z.hmd', '# Zed'),
    page('guide/b.hmd', '::page{order=2}\n\n# B'),
    page('index.hmd', '# Home'),
    page('a.hmd', '::page{order=1 title="Alpha"}'),
    page('notitle.hmd', 'text'),
  ])
  t.alike(menu.map(m => m.title), ['Home', 'Alpha', 'B', 'notitle', 'Zed'])
  t.is(menu[2].url, '/guide/b.hmd')
})

test('applyLayout: page in ::content, menu filled, layout links from the root', t => {
  const layout = parse([
    '::script{src=js/site.js}',
    ':::header',
    '[Home](index.hmd) [Ext](https://x.org) [Top](#top) ![Logo](media/logo.png)',
    '::menu',
    ':::',
    '::content',
    ':::footer',
    'Made with HyperMD',
    ':::',
  ].join('\n\n'))
  const page = parse('::page{title=Start}\n\n# Start\n\n[faq](faq.hmd)')
  const menu = [{ url: '/index.hmd', title: 'Home' }, { url: '/guide/start.hmd', title: 'Start' }]
  const doc = applyLayout(layout, page, { menu, current: 'guide/start.hmd' })

  t.is(doc.layout, true)
  t.alike(doc.meta, page.meta)
  t.alike(doc.nodes.map(n => n.type), ['HeaderNode', 'ContentSlot', 'FooterNode'])
  t.is(doc.scripts[0].props.src, '/js/site.js')
  const out = renderHTML(doc.nodes)
  t.ok(out.includes('href="/index.hmd">Home'), 'layout link made site-root')
  t.ok(out.includes('href="https://x.org"') && out.includes('href="#top"'))
  t.ok(out.includes('src="/media/logo.png"'))
  t.ok(out.includes('aria-current="page" href="/guide/start.hmd"'), 'current page marked')
  t.ok(out.includes('href="faq.hmd"'), 'page links untouched')
  t.is(JSON.stringify(layout).includes('ContentSlot","id":null,"props":{},"children":[]'), true, 'layout not changed')

  const page2 = renderPage(doc)
  t.is(page2.match(/<main/g).length, 1, 'one <main>: the content slot')
  t.ok(page2.includes('<title>Start</title>'))
})

test('applyLayout: no ::content puts the page last', t => {
  const doc = applyLayout(parse('# Site'), parse('body'))
  t.alike(doc.nodes.map(n => n.type), ['Heading', 'ContentSlot'])
})
