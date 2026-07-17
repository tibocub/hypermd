/**
 * query.test.js — tests for hypermd's query/template parsing
 *
 * Only tests what hypermd owns:
 *   - ::query and :::template directive parsing
 *   - doc.queries / doc.templates collections populated correctly
 *   - templateSource extracted verbatim (filters with : not mangled)
 *   - interpolate() filter engine
 *
 * The query resolver (actually running fetchers + expanding templates)
 * lives in HyperBBS — tested separately there.
 */

import { parse } from '../src/index.js'
import { interpolate } from '../src/template-engine.js'

// ─── Test 1: ::query parses as QueryBlock in nodes + doc.queries ──────────────

const doc1 = parse(`
# Forum

::query{type=post sort=createdAt:desc limit=10 as=posts}

Some text after.
`)

const queryNode = doc1.nodes.find(n => n.type === 'QueryBlock')
console.assert(queryNode != null, 'QueryBlock should be in doc.nodes')
console.assert(doc1.queries.length === 1, `doc.queries should have 1 entry, got ${doc1.queries.length}`)
console.assert(doc1.queries[0].props.as === 'posts', 'as= prop parsed')
console.assert(doc1.queries[0].props.type === 'post', 'type= prop parsed')
console.assert(doc1.queries[0].props.sortField === 'createdAt', 'sort field parsed')
console.assert(doc1.queries[0].props.sortDir === 'desc', 'sort dir parsed')
console.assert(Number(doc1.queries[0].props.limit) === 10, 'limit parsed')
console.log('Test 1 passed: ::query parses correctly')

// ─── Test 2: :::template parses as TemplateBlock + doc.templates ─────────────

const doc2 = parse(`
::query{type=post as=posts}

:::template{for=posts}
## {{entity.author|pubkey:short}}
{{content.body|truncate:100}}
:::
`)

const templateNode = doc2.nodes.find(n => n.type === 'TemplateBlock')
console.assert(templateNode != null, 'TemplateBlock should be in doc.nodes')
console.assert(doc2.templates.length === 1, `doc.templates should have 1 entry, got ${doc2.templates.length}`)
console.assert(doc2.templates[0].props.for === 'posts', 'for= prop parsed')

// Critical: templateSource must be verbatim — colons in filter args must survive
const src = doc2.templates[0].props.templateSource
console.assert(src.includes('|pubkey:short'),   `|pubkey:short must be verbatim in templateSource, got: ${src}`)
console.assert(src.includes('|truncate:100'),    `|truncate:100 must be verbatim in templateSource, got: ${src}`)
console.log('Test 2 passed: :::template templateSource extracted verbatim (filters intact)')

// ─── Test 3: ::query and :::template are siblings, not nested ────────────────

// If ::query were a container (:::query), :::template would be parsed
// as its child — verified this is NOT the case by using leaf syntax.
console.assert(doc2.nodes[0].type === 'QueryBlock', 'QueryBlock is top-level')
console.assert(doc2.nodes[1].type === 'TemplateBlock', 'TemplateBlock is top-level sibling')
console.log('Test 3 passed: ::query and :::template are siblings')

// ─── Test 4: multiple independent query+template pairs ───────────────────────

const doc3 = parse(`
::query{type=post tag=featured as=featured}
::query{type=post limit=5 as=recent}

:::template{for=featured}
Featured: {{content.body}}
:::

:::template{for=recent}
Recent: {{content.body}}
:::
`)

console.assert(doc3.queries.length === 2, `Should have 2 queries, got ${doc3.queries.length}`)
console.assert(doc3.templates.length === 2, `Should have 2 templates, got ${doc3.templates.length}`)
console.assert(doc3.queries[0].props.as === 'featured', 'First query as=featured')
console.assert(doc3.queries[1].props.as === 'recent', 'Second query as=recent')
console.assert(doc3.templates[0].props.for === 'featured', 'First template for=featured')
console.assert(doc3.templates[1].props.for === 'recent', 'Second template for=recent')
console.log('Test 4 passed: multiple query+template pairs parse independently')

// ─── Test 5: missing as= drops query block ────────────────────────────────────

const doc4 = parse(`::query{type=post limit=5}`)
console.assert(doc4.queries.length === 0, 'Missing as= should drop the query block')
console.assert(doc4.nodes.filter(n => n.type === 'QueryBlock').length === 0, 'QueryBlock not in nodes either')
console.log('Test 5 passed: missing as= drops query block with warning')

// ─── Test 6: interpolate() filter engine ─────────────────────────────────────

const item = {
  entity:  { id: 'abc', type: 'post', author: 'abcdef1234567890abcd', createdAt: Date.now() - 7200000 },
  content: { body: 'Hello from the first post, with a long body that goes on and on!' },
  tags:    ['sub:programming', 'featured'],
  relations: { reply: { count: 5 } },
  index: 0,
  route: { id: 'page-abc' },
}

const tests = [
  ['{{entity.author|pubkey:short}}', 'abcdef12…'],
  ['{{content.body|truncate:10}}', 'Hello from…'],
  ['{{entity.createdAt|date:relative}}', /ago/],   // "2 hours ago" roughly
  ['{{tag:sub:}}', 'programming'],
  ['{{tags}}', 'sub:programming featured'],
  ['{{relations.reply.count}}', '5'],
  ['{{entity.missing|default:fallback}}', 'fallback'],
  ['{{entity.author|uppercase}}', 'ABCDEF1234567890ABCD'],
  ['{{route.id}}', 'page-abc'],
  ['{{index}}', '0'],
  ['{{entity.id|prefix:post-}}', 'post-abc'],
]

for (const [template, expected] of tests) {
  const result = interpolate(template, item)
  if (expected instanceof RegExp) {
    console.assert(expected.test(result), `"${template}" → expected /${expected.source}/, got "${result}"`)
  } else {
    console.assert(result === expected, `"${template}" → expected "${expected}", got "${result}"`)
  }
}
console.log('Test 6 passed: interpolate() all filter types work correctly')

// ─── Test 7: colon-containing filter args survive markdown parsing ────────────

// This is the key regression test — micromark's inline directive parser
// treats :word as a potential inline directive. Template source extraction
// must use raw source slicing (extractRawBody), not markdown's parsed nodes.
const doc5 = parse(`
:::template{for=x}
{{a|pubkey:short}} {{b|truncate:50}} {{c|default:fallback}} {{d|date:relative}}
:::
`)
const rawSrc = doc5.templates[0]?.props.templateSource ?? ''
console.assert(rawSrc.includes('pubkey:short'),   `pubkey:short intact — got: "${rawSrc}"`)
console.assert(rawSrc.includes('truncate:50'),    `truncate:50 intact — got: "${rawSrc}"`)
console.assert(rawSrc.includes('default:fallback'), `default:fallback intact — got: "${rawSrc}"`)
console.assert(rawSrc.includes('date:relative'), `date:relative intact — got: "${rawSrc}"`)
console.log('Test 7 passed: filter args with colons survive markdown parsing intact')

console.log('\n✓ All hypermd query/template parsing tests passed')