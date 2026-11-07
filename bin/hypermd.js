#!/usr/bin/env node
// hypermd build <folder> [--out <dir>] [--url <site address>]   (runs on Node and Bare)
import { build } from '../src/build.js'

const runtime = globalThis.Bare ?? globalThis.process
const args = runtime.argv.slice(2)
const usage = 'usage: hypermd build <folder> [--out <dir>] [--url <site address>]'

const flag = name => {
  const at = args.indexOf(name)
  return at < 0 ? undefined : (args[at + 1] && !args[at + 1].startsWith('--') ? args[at + 1] : null)
}
const [cmd, inDir] = args
const outDir = flag('--out')
const url = flag('--url')

if (cmd !== 'build' || !inDir || inDir.startsWith('--') || outDir === null || url === null) {
  console.error(usage)
  runtime.exitCode = 1
} else {
  try {
    const { pages, files, removed } = build(inDir, outDir, { url })
    console.log(`built ${pages.length} page(s), copied ${files.length} file(s), removed ${removed.length} old file(s)`)
  } catch (e) {
    console.error(`hypermd build: ${e.message}`)
    runtime.exitCode = 1
  }
}
