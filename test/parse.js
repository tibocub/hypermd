import { readFileSync } from 'node:fs'
import { parse, applyStyles } from '../src/parser.js'

const source = readFileSync(new URL('./sample.hmd', import.meta.url), 'utf8')

const doc = parse(source, { baseKey: 'page:index' })
applyStyles(doc.nodes, doc.styles)

// Pretty-print the HyperDOM tree
function printTree(nodes, indent = 0) {
  const pad = '  '.repeat(indent)
  for (const node of nodes) {
    const { type, id, props, children } = node

    const idStr = id ? ` #${id}` : ''
    const propStr = Object.entries(props)
      .filter(([k]) => k !== 'id' && k !== 'source' && k !== 'rules')
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(' ')
    const extra = propStr ? ` [${propStr}]` : ''

    console.log(`${pad}${type}${idStr}${extra}`)

    if (children?.length) printTree(children, indent + 1)
  }
}

console.log('\n── HyperDOM nodes ──────────────────────────────')
printTree(doc.nodes)

console.log('\n── Collected styles ────────────────────────────')
for (const s of doc.styles) {
  console.log(JSON.stringify(s.props.rules, null, 2))
}

console.log('\n── Collected scripts ───────────────────────────')
for (const s of doc.scripts) {
  console.log(s.props.source)
}

console.log(`\n✓ Parsed ${doc.nodes.length} top-level nodes, ${doc.styles.length} style block(s), ${doc.scripts.length} script block(s)`)
