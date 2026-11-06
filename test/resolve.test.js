import test from 'brittle'
import { parse, applyStyles, resolveExternals } from '../src/index.js'

const files = {
  'utils.js': 'export const x = `a ${b}`',
  'theme.hcss': '{ "h1": { "fg": "teal" }, "#go": { "bold": true } }',
  'broken.hcss': 'not json',
  'array.hcss': '[1, 2]',
}

async function loader(src, kind) {
  loader.calls.push([src, kind])
  if (!(src in files)) throw new Error('not found: ' + src)
  return files[src]
}

test('resolveExternals fills script source and style rules', async t => {
  loader.calls = []
  const doc = parse('::style{src=theme.hcss}\n::script{src=utils.js}\n\n# Title\n\n::button[Go]{id=go}')
  await resolveExternals(doc, loader)
  t.alike(loader.calls.sort(), [['theme.hcss', 'style'], ['utils.js', 'script']])
  t.is(doc.scripts[0].props.source, files['utils.js'])
  t.alike(doc.styles[0].props.rules, { h1: { fg: 'teal' }, '#go': { bold: true } })

  applyStyles(doc.nodes, doc.styles)
  t.is(doc.nodes[0].props.fg, 'teal')
  t.is(doc.nodes[1].props.bold, true)
})

test('inline blocks are not passed to the loader', async t => {
  loader.calls = []
  const doc = parse(':::script\nlet a = 1\n:::\n\n:::style\n{"x":{}}\n:::')
  await resolveExternals(doc, loader)
  t.alike(loader.calls, [])
})

test('failed loads leave empty results and an error, never throw', async t => {
  const doc = parse('::script{src=missing.js}\n::style{src=missing.hcss}\n::style{src=broken.hcss}\n::style{src=array.hcss}')
  await resolveExternals(doc, loader)
  t.is(doc.scripts[0].props.source, '')
  t.is(doc.scripts[0].props._loadError, 'not found: missing.js')
  for (const s of doc.styles) {
    t.alike(s.props.rules, {})
    t.ok(s.props._loadError, s.props.src + ' has an error')
  }
})
