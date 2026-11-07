import test from 'brittle'
import { parse, applyStyles } from '../src/index.js'

// Strip the renderer slot so trees compare cleanly
const tree = nodes => JSON.parse(JSON.stringify(nodes, (k, v) => (k === '_tuiRef' ? undefined : v)))
const text = value => ({ type: 'Text', id: null, props: { value }, children: [] })

function findDeep(nodes, pred) {
  for (const n of nodes) {
    if (pred(n)) return n
    const found = findDeep(n.children ?? [], pred)
    if (found) return found
  }
  return null
}

test('markdown passthrough: headings, paragraphs, inline marks', t => {
  const doc = parse('# Title\n\nSome **bold**, _em_ and `code`.')
  t.alike(tree(doc.nodes), [
    { type: 'Heading', id: 'title', props: { depth: 1, id: 'title' }, children: [text('Title')] },
    {
      type: 'Paragraph', id: null, props: {}, children: [
        text('Some '),
        { type: 'Strong', id: null, props: {}, children: [text('bold')] },
        text(', '),
        { type: 'Emphasis', id: null, props: {}, children: [text('em')] },
        text(' and '),
        { type: 'InlineCode', id: null, props: { value: 'code' }, children: [] },
        text('.'),
      ],
    },
  ])
})

test('markdown passthrough: code, links, lists, breaks, thematic break', t => {
  const doc = parse('```js\nconst x = 1\n```\n\n[site](hyper://abc "T")\n\n1. one\n2. two\n\nline  \nnext\n\n---')
  const [code, para, list, brk, hr] = doc.nodes
  t.alike(code.props, { value: 'const x = 1', lang: 'js' })
  t.alike(tree([para.children[0]]), [{ type: 'Link', id: null, props: { url: 'hyper://abc', title: 'T' }, children: [text('site')] }])
  t.is(list.type, 'List')
  t.is(list.props.ordered, true)
  t.is(list.children.length, 2)
  t.is(list.children[0].type, 'ListItem')
  t.is(brk.children[1].type, 'Break')
  t.is(hr.type, 'DividerNode')
})

test('reference links and images resolve through their definitions', t => {
  const doc = parse('[docs][d] and ![logo][l]\n\n[d]: /docs.md "Docs"\n[l]: logo.png')
  t.is(doc.nodes.length, 2, 'image is lifted out of the paragraph')
  t.alike(doc.nodes[0].children[0].props, { url: '/docs.md', title: 'Docs' })
  t.is(doc.nodes[1].type, 'ImageNode')
  t.is(doc.nodes[1].props.src, 'logo.png')
  t.is(doc.nodes[1].props.label, 'logo')
})

test('unknown inline :word stays as text', t => {
  const doc = parse('Say :smile and Note:abc ok')
  const joined = doc.nodes[0].children.map(c => c.props.value).join('')
  t.is(joined, 'Say :smile and Note:abc ok')
})

test(':color inline span', t => {
  const doc = parse('a :color[teal text]{fg=teal} b')
  const span = doc.nodes[0].children[1]
  t.is(span.type, 'ColorSpan')
  t.is(span.props.fg, 'teal')
  t.alike(tree(span.children), [text('teal text')])
})

test('containers nest with longer outer fences', t => {
  const doc = parse('::::panel{id=outer border=rounded}\nhello\n\n:::form{id=f}\n::input{id=name}\n::button[Go]{id=go}\n:::\n::::')
  const outer = doc.nodes[0]
  t.is(outer.type, 'ContainerPanel')
  t.is(outer.id, 'outer')
  t.is(outer.props.border, 'rounded')
  t.is(outer.children[0].type, 'Paragraph')
  const form = outer.children[1]
  t.is(form.type, 'ContainerForm')
  t.alike(form.children.map(c => c.type), ['InputNode', 'ButtonNode'])
  t.is(form.children[1].props.label, 'Go')
})

test(':::columns container', t => {
  const doc = parse(':::columns\nleft\n:::')
  t.is(doc.nodes[0].type, 'ContainerColumns')
})

test('leaf widgets: marquee, bigtext, hr, select', t => {
  const doc = parse('::marquee[News]{speed=2}\n::bigtext[HI]{font=block}\n::hr\n::select{id=s}')
  t.alike(doc.nodes.map(n => n.type), ['MarqueeNode', 'BigTextNode', 'DividerNode', 'SelectNode'])
  t.alike(doc.nodes[0].props, { speed: 2, label: 'News' })
  t.is(doc.nodes[1].props.label, 'HI')
})

test('attributes: only plain numbers and booleans are coerced', t => {
  const [node] = parse('::input{id=007 placeholder="" hex=0x10 max=32 ratio=-1.5 on=true off=false}').nodes
  t.is(node.id, '007', 'id stays text')
  t.alike(node.props, { id: '007', placeholder: '', hex: '0x10', max: 32, ratio: -1.5, on: true, off: false })
})

test('unknown directives are dropped, not crashing', t => {
  const doc = parse('::nope{a=1}\n\n:::alsonope\nx\n:::\n\nafter')
  t.alike(doc.nodes.map(n => n.type), ['Paragraph'])
})

test('stray closing fence is dropped', t => {
  const doc = parse('text\n\n:::\n')
  t.alike(doc.nodes.map(n => n.type), ['Paragraph'])
})

test('raw HTML in markdown is dropped', t => {
  const doc = parse('<script>alert(1)</script>\n\nok')
  t.alike(doc.nodes.map(n => n.type), ['Paragraph'])
})

test('blockquote', t => {
  t.alike(tree(parse('> quoted').nodes), [{ type: 'Blockquote', id: null, props: {}, children: [{ type: 'Paragraph', id: null, props: {}, children: [text('quoted')] }] }])
})

test(':::script body is extracted verbatim and not rendered', t => {
  const body = 'const x = `hi ${name}`\nif (a[0] && *b*) run()'
  const doc = parse(`# T\n\n:::script\n${body}\n:::`)
  t.is(doc.nodes.length, 1)
  t.is(doc.scripts.length, 1)
  t.is(doc.scripts[0].props.source, body)
})

test('::script{src} leaf is collected with empty source; without src dropped', t => {
  const doc = parse('::script{src=utils.js}\n::script')
  t.is(doc.scripts.length, 1)
  t.alike(doc.scripts[0].props, { src: 'utils.js', source: '' })
  t.is(doc.nodes.length, 0)
})

test(':::style parses JSON rules; bad JSON gives empty rules', t => {
  const doc = parse(':::style\n{ "ButtonNode": { "fg": "amber" } }\n:::\n\n:::style\nnot json\n:::\n\n::style{src=theme.hcss}')
  t.is(doc.nodes.length, 0)
  t.alike(doc.styles.map(s => s.props.rules), [{ ButtonNode: { fg: 'amber' } }, {}, {}])
  t.is(doc.styles[2].props.src, 'theme.hcss')
})

test('applyStyles: type < depth < #id < type#id, later blocks win', t => {
  const doc = parse([
    '# Big',
    '## Small',
    '::button[B]{id=go}',
    ':::style',
    '{ "Heading": { "a": 1, "b": 1 }, "h1": { "b": 2, "c": 2 }, "#go": { "fg": "red" }, "ButtonNode#go": { "fg": "blue" } }',
    ':::',
    ':::style',
    '{ "h2": { "a": 9 } }',
    ':::',
  ].join('\n'))
  applyStyles(doc.nodes, doc.styles)
  const [h1, h2, btn] = doc.nodes
  t.is(h1.props.a, 1)
  t.is(h1.props.b, 2)
  t.is(h1.props.c, 2)
  t.is(h2.props.a, 9)
  t.is(h2.props.c, undefined)
  t.is(btn.props.fg, 'blue')
})

test('applyStyles reaches nested nodes', t => {
  const doc = parse('::::panel\n:::form\n::button[x]{id=deep}\n:::\n::::\n\n:::style\n{ "#deep": { "bold": true } }\n:::')
  applyStyles(doc.nodes, doc.styles)
  t.is(findDeep(doc.nodes, n => n.id === 'deep').props.bold, true)
})

test('parse output has the documented keys', t => {
  const doc = parse('x')
  t.alike(Object.keys(doc).sort(), ['_mdast', 'meta', 'nodes', 'queries', 'scripts', 'styles', 'templates'])
  t.alike(Object.keys(doc.nodes[0]).sort(), ['_tuiRef', 'children', 'id', 'props', 'type'])
})
