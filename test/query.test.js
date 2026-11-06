import test from 'brittle'
import { parse, interpolate } from '../src/index.js'

test('::query parses into nodes and doc.queries', t => {
  const doc = parse('# Forum\n\n::query{type=post sort=createdAt:desc limit=10 as=posts}\n\nafter')
  const q = doc.nodes[1]
  t.is(q.type, 'QueryBlock')
  t.is(doc.queries[0], q, 'same node in both places')
  t.alike(q.props, { type: 'post', sort: 'createdAt:desc', limit: 10, as: 'posts', sortField: 'createdAt', sortDir: 'desc', _resolved: false })
})

test('::query sort direction defaults to asc', t => {
  t.is(parse('::query{as=a sort=name}').queries[0].props.sortDir, 'asc')
  t.is(parse('::query{as=a sort=name:sideways}').queries[0].props.sortDir, 'asc')
})

test('::query without as= is dropped', t => {
  const doc = parse('::query{type=post limit=5}')
  t.is(doc.queries.length, 0)
  t.is(doc.nodes.length, 0)
})

test(':::template is a sibling of ::query, body verbatim', t => {
  const doc = parse('::query{type=post as=posts}\n\n:::template{for=posts}\n## {{entity.author|pubkey:short}}\n{{content.body|truncate:100}} {{d|date:relative}}\n:::')
  t.alike(doc.nodes.map(n => n.type), ['QueryBlock', 'TemplateBlock'])
  const tpl = doc.templates[0]
  t.is(tpl.props.for, 'posts')
  t.is(tpl.props._resolved, false)
  t.is(tpl.props.templateSource, '## {{entity.author|pubkey:short}}\n{{content.body|truncate:100}} {{d|date:relative}}')
})

test(':::template without for= is dropped', t => {
  const doc = parse(':::template\nx\n:::')
  t.is(doc.templates.length, 0)
  t.is(doc.nodes.length, 0)
})

test('several query+template pairs stay independent', t => {
  const doc = parse('::query{as=featured}\n::query{as=recent}\n\n:::template{for=featured}\nF\n:::\n\n:::template{for=recent}\nR\n:::')
  t.alike(doc.queries.map(q => q.props.as), ['featured', 'recent'])
  t.alike(doc.templates.map(q => q.props.for), ['featured', 'recent'])
})

const item = {
  entity: { id: 'abc', author: 'abcdef1234567890abcd', createdAt: Date.now() - 2 * 3600e3 },
  content: { body: 'Hello from the first post, with a long body' },
  tags: ['sub:programming', 'featured'],
  relations: { reply: { count: 5 } },
  index: 0,
  route: { id: 'page-abc' },
}

test('interpolate: paths and filters', t => {
  const cases = [
    ['{{entity.author|pubkey:short}}', 'abcdef12…'],
    ['{{entity.author|short}}', 'abcdef12…'],
    ['{{content.body|truncate:10}}', 'Hello from…'],
    ['{{entity.createdAt|date:relative}}', '2h ago'],
    ['{{tag:sub:}}', 'programming'],
    ['{{tag:none:}}', ''],
    ['{{tags}}', 'sub:programming featured'],
    ['{{relations.reply.count}}', '5'],
    ['{{relations.like.count}}', ''],
    ['{{entity.missing|default:fallback}}', 'fallback'],
    ['{{entity.id|default:fallback}}', 'abc'],
    ['{{entity.id|uppercase}}', 'ABC'],
    ['{{route.id|lowercase}}', 'page-abc'],
    ['{{index}}', '0'],
    ['{{entity.id|prefix:post-}}', 'post-abc'],
    ['{{entity.id|suffix:!}}', 'abc!'],
    ['{{entity.id|nosuchfilter}}', 'abc'],
    ['{{ entity.id | uppercase | prefix:# }}', '#ABC'],
    ['{{nothing.at.all}}', ''],
  ]
  for (const [tpl, want] of cases) t.is(interpolate(tpl, item), want, tpl)
})

test('interpolate: date filters', t => {
  const ctx = { at: Date.UTC(2024, 0, 2, 3, 4, 5) }
  t.is(interpolate('{{at|date:iso}}', ctx), '2024-01-02T03:04:05.000Z')
  t.is(interpolate('{{at|date:relative}}', { at: Date.now() + 3 * 86400e3 + 1000 }), '3 days from now')
  t.is(interpolate('{{bad|date:iso}}', { bad: 'not a date' }), 'not a date')
})

test('interpolate: a missing date stays empty, not 1970', t => {
  t.is(interpolate('[{{entity.createdAt|date:iso}}]', { entity: {} }), '[]')
})

test('interpolated template re-parses as HyperMD', t => {
  const src = parse(':::template{for=p}\n**{{entity.id}}** ::button[x]{id=b-{{index}}}\n:::').templates[0].props.templateSource
  const doc = parse(interpolate(src, item))
  t.is(doc.nodes[0].children[0].type, 'Strong')
  t.is(doc.nodes[0].children[0].children[0].props.value, 'abc')
})
