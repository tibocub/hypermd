import test from 'brittle'
import { parse, renderHTML, renderPage, createNode, NodeTypes, safeURL } from '../src/index.js'

const html = src => renderHTML(parse(src).nodes)

// One case per node type; the coverage test below fails if a type is missing
const cases = {
  Heading: ['## Hi', '<h2 class="hmd-Heading">Hi</h2>\n'],
  Paragraph: ['hello', '<p class="hmd-Paragraph">hello</p>\n'],
  Text: ['a & b', '<p class="hmd-Paragraph">a &amp; b</p>\n'],
  Strong: ['**b**', '<p class="hmd-Paragraph"><strong class="hmd-Strong">b</strong></p>\n'],
  Emphasis: ['_e_', '<p class="hmd-Paragraph"><em class="hmd-Emphasis">e</em></p>\n'],
  InlineCode: ['`<x>`', '<p class="hmd-Paragraph"><code class="hmd-InlineCode">&lt;x&gt;</code></p>\n'],
  CodeBlock: ['```js\nif (a < b) {}\n```', '<pre class="hmd-CodeBlock"><code class="language-js">if (a &lt; b) {}</code></pre>\n'],
  Link: ['[go](page.hmd "T")', '<p class="hmd-Paragraph"><a class="hmd-Link" title="T" href="page.hmd">go</a></p>\n'],
  List: ['- a\n- b', '<ul class="hmd-List">\n<li class="hmd-ListItem"><p class="hmd-Paragraph">a</p>\n</li>\n<li class="hmd-ListItem"><p class="hmd-Paragraph">b</p>\n</li>\n</ul>\n'],
  ListItem: ['1. a', '<ol class="hmd-List">\n<li class="hmd-ListItem"><p class="hmd-Paragraph">a</p>\n</li>\n</ol>\n'],
  Break: ['a  \nb', '<p class="hmd-Paragraph">a<br>\nb</p>\n'],
  ColorSpan: [':color[hi]{fg=teal}', '<p class="hmd-Paragraph"><span class="hmd-ColorSpan" style="color:teal" data-fg="teal">hi</span></p>\n'],
  DividerNode: ['::hr', '<hr class="hmd-DividerNode">\n'],
  ContainerPanel: [':::panel{id=p}\nx\n:::', '<section id="p" class="hmd-ContainerPanel">\n<p class="hmd-Paragraph">x</p>\n</section>\n'],
  ContainerForm: [':::form\n::input{id=name placeholder="Your name" maxlength=32}\n:::', '<div class="hmd-ContainerForm" role="form">\n<input id="name" class="hmd-InputNode" name="name" type="text" placeholder="Your name" maxlength="32">\n</div>\n'],
  ContainerColumns: [':::columns\nx\n:::', '<div class="hmd-ContainerColumns">\n<p class="hmd-Paragraph">x</p>\n</div>\n'],
  InputNode: ['::input{id=pw type=password}', '<input id="pw" class="hmd-InputNode" name="pw" type="password">\n'],
  ButtonNode: ['::button[Go]{id=go}', '<button id="go" class="hmd-ButtonNode" type="button">Go</button>\n'],
  SelectNode: [`::select{id=c options='[{"name":"Red"},{"name":"Blue","value":"b"}]' selectedIndex=1}`,
    '<select id="c" class="hmd-SelectNode" name="c"><option value="Red">Red</option><option value="b" selected>Blue</option></select>\n'],
  MarqueeNode: ['::marquee[News]{speed=2}', '<div class="hmd-MarqueeNode">News</div>\n'],
  BigTextNode: ['::bigtext[HI]', '<div class="hmd-BigTextNode" role="heading" aria-level="1">HI</div>\n'],
  AudioNode: ['::audio[Song]{src=a.mp3 type=audio/mpeg}', '<figure class="hmd-AudioNode"><audio controls preload="none"><source src="a.mp3" type="audio/mpeg"><a href="a.mp3">Song</a></audio><figcaption>Song</figcaption></figure>'],
  VideoNode: ['::video{src=v.mp4}', '<figure class="hmd-VideoNode"><video controls preload="none"><source src="v.mp4"><a href="v.mp4">v.mp4</a></video></figure>'],
  ImageNode: ['![Sea](sea.jpg "2024")', '<img class="hmd-ImageNode" alt="Sea" title="2024" src="sea.jpg">'],
  QueryBlock: ['::query{as=posts}', ''],
  TemplateBlock: ['::query{as=p}\n\n:::template{for=p}\n{{x}}\n:::', ''],
  ScriptBlock: [':::script\nalert(1)\n:::', ''],
  StyleBlock: [':::style\n{}\n:::', ''],
}

for (const [type, [src, want]] of Object.entries(cases)) {
  test(`renders ${type}`, t => t.is(html(src), want))
}

test('every node type has a render case', t => {
  const types = Object.values(NodeTypes).filter(v => typeof v === 'string' && /^[A-Z]/.test(v))
  for (const type of types) t.ok(type in cases, type)
})

test('resolved data views render their children', t => {
  const q = createNode('TemplateBlock', { for: 'p', _resolved: true }, [createNode('Text', { value: 'item' })])
  t.is(renderHTML([q]), '<div class="hmd-TemplateBlock">item</div>\n')
})

test('unknown node types keep their content', t => {
  t.is(renderHTML([createNode('Mystery', {}, [createNode('Text', { value: 'kept' })])]), 'kept')
})

test('media with no src shows a notice', t => {
  t.is(html('::video[Clip]'), '<span class="hmd-VideoNode hmd-media-error">Missing media: Clip</span>')
})

test('safety: page text cannot inject markup or script', t => {
  const out = html([
    '<script>alert(1)</script>',
    '',
    '<img src=x onerror=alert(1)> **"q" \'s**',
    '',
    '[x](javascript:alert(1)) [y]( JaVaScRiPt:alert(1)) [z](data:text/html,<b>)',
    '',
    '![i](javascript:alert(1))',
    '',
    '::button[</button><script>x</script>]{id="a\\" onclick=\\"x"}',
    ':color[c]{fg="red;background:url(x)"}',
    '::audio[a]{src=vbscript:x}',
  ].join('\n'))
  t.absent(/<script/i.test(out), 'no script tag')
  t.absent(/<img src=x/i.test(out), 'raw html dropped')
  t.absent(/javascript:|vbscript:|data:/i.test(out), 'no script urls')
  t.absent(/onclick="/.test(out), 'no attribute breakout')
  t.absent(/style="[^"]*background/.test(out), 'no css injection')
  t.ok(out.includes('&quot;q&quot; &#39;s'))
})

test('safeURL keeps P2P and relative addresses', t => {
  for (const u of ['hyper://abc', 'swarmfs://9f2c', 'page.html', '#top', 'https://x.org', 'mailto:a@b.c']) t.is(safeURL(u), u)
  t.is(safeURL('java\nscript:x'), '#')
})

test('href option rewrites link and media addresses', t => {
  const out = renderHTML(parse('[a](b.hmd) ![i](c.png)').nodes, { href: u => 'X/' + u })
  t.ok(out.includes('href="X/b.hmd"'))
  t.ok(out.includes('src="X/c.png"'))
})

test('renderPage: full document with title, css and scripts', t => {
  const doc = parse('# Docs & "more"\n\ntext\n\n:::script\nalert(1)\n:::')
  const out = renderPage(doc, { styles: ['site.css'], scripts: ['app.js'] })
  t.ok(out.startsWith('<!doctype html>\n<html lang="en">'))
  t.ok(out.includes('<meta charset="utf-8">'))
  t.ok(out.includes('<title>Docs &amp; &quot;more&quot;</title>'))
  t.ok(out.includes('<link rel="stylesheet" href="site.css">'))
  t.ok(out.includes('<script type="module" src="app.js"></script>'))
  t.absent(out.includes('alert(1)'), 'inline :::script not emitted')
  t.is(renderPage(parse('no heading'), { title: 'T' }).includes('<title>T</title>'), true)
})
