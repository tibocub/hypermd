import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse, applyStyles, resolveExternals } from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'external.hmd'), 'utf8')

const doc = parse(source)

console.log('Before resolve:')
console.log('  scripts:', doc.scripts.map(s => ({ src: s.props.src, source: s.props.source })))
console.log('  styles:', doc.styles.map(s => ({ src: s.props.src, rules: s.props.rules })))

// A trivial filesystem-backed loader, resolving src relative to the
// fixtures dir. In HyperBBS this would instead be a Hypergraph key
// lookup — see resolve.js's doc comment.
async function fsLoader(src) {
  const path = join(__dirname, src)
  return readFileSync(path, 'utf8')
}

await resolveExternals(doc, fsLoader)
applyStyles(doc.nodes, doc.styles)

console.log('\nAfter resolve:')
console.log('  scripts:', doc.scripts.map(s => ({ src: s.props.src, source: s.props.source })))
console.log('  styles:', doc.styles.map(s => ({ src: s.props.src, rules: s.props.rules })))

/**
 * Real HyperMD documents commonly nest interactive elements several
 * levels deep (e.g. ButtonNode inside ContainerForm inside
 * ContainerPanel) — a shallow doc.nodes.find() only sees top-level
 * siblings and will silently miss them. Use this instead of find()
 * whenever you need to locate a node anywhere in the tree.
 */
function findDeep(nodes, predicate) {
  for (const n of nodes) {
    if (predicate(n)) return n
    if (n.children?.length) {
      const found = findDeep(n.children, predicate)
      if (found) return found
    }
  }
  return null
}

const h1 = findDeep(doc.nodes, n => n.type === 'Heading' && n.props.depth === 1)
if (h1) {
  console.log('\nh1 props after style applied:', JSON.stringify(h1.props))
} else {
  console.log('\n(no h1 in this document)')
}

const btn = findDeep(doc.nodes, n => n.type === 'ButtonNode')
if (btn) {
  console.log('button props after style applied:', JSON.stringify(btn.props))
} else {
  console.log('(no ButtonNode in this document)')
}