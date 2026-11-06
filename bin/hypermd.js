#!/usr/bin/env node
// hypermd build <folder> [--out <dir>]   (runs on Node and Bare)
import { build } from '../src/build.js'

const runtime = globalThis.Bare ?? globalThis.process
const args = runtime.argv.slice(2)
const usage = 'usage: hypermd build <folder> [--out <dir>]'

const [cmd, inDir] = args
const at = args.indexOf('--out')
const outDir = at >= 0 ? args[at + 1] : undefined

if (cmd !== 'build' || !inDir || inDir === '--out' || (at >= 0 && !outDir)) {
  console.error(usage)
  runtime.exitCode = 1
} else {
  try {
    const { pages, files } = build(inDir, outDir)
    console.log(`built ${pages.length} page(s), copied ${files.length} file(s)`)
  } catch (e) {
    console.error(`hypermd build: ${e.message}`)
    runtime.exitCode = 1
  }
}
