// Media nodes, per HyperBBS specs/001-hypersite-media/contracts/hypermd-media-nodes.md
import test from 'brittle'
import { parse, AUDIO_NODE, VIDEO_NODE, IMAGE_NODE, NodeTypes } from '../src/index.js'

test('constants are exported', t => {
  t.is(AUDIO_NODE, 'AudioNode')
  t.is(VIDEO_NODE, 'VideoNode')
  t.is(IMAGE_NODE, 'ImageNode')
  t.is(NodeTypes.IMAGE_NODE, 'ImageNode')
})

test('::audio / ::video / ::image / ::img directives', t => {
  const doc = parse('::audio[Theme song]{src=swarmfs://9f2ca1b3 type=audio/mpeg}\n::video[Trailer]{src=clips/trailer.mp4}\n::image[Logo]{src=logo.png}\n::img[Logo]{src=logo.png id=l}')
  t.alike(doc.nodes.map(n => n.type), ['AudioNode', 'VideoNode', 'ImageNode', 'ImageNode'])
  t.alike(doc.nodes[0].props, { src: 'swarmfs://9f2ca1b3', type: 'audio/mpeg', label: 'Theme song', title: null, origin: 'directive', error: null })
  t.is(doc.nodes[1].props.type, null)
  t.is(doc.nodes[3].id, 'l')
  for (const n of doc.nodes) t.alike(n.children, [])
})

test('src is never converted to a number', t => {
  t.is(parse('::audio{src=12345}').nodes[0].props.src, '12345')
})

test('missing src keeps the node with an error', t => {
  const [a, b] = parse('::video[Clip]\n::image{src=""}').nodes
  t.is(a.props.src, null)
  t.is(a.props.error, 'missing-src')
  t.is(a.props.label, 'Clip')
  t.is(b.props.error, 'missing-src')
})

test('markdown image is lifted out of its paragraph', t => {
  const doc = parse('a ![A photo](sea.jpg "Taken in 2024") b')
  t.alike(doc.nodes.map(n => n.type), ['Paragraph', 'ImageNode', 'Paragraph'])
  t.alike(doc.nodes[1].props, { src: 'sea.jpg', label: 'A photo', title: 'Taken in 2024', type: null, origin: 'markdown-image', error: null })
  t.is(doc.nodes[0].children[0].props.value, 'a ')
  t.is(doc.nodes[2].children[0].props.value, ' b')
})

test('lone image leaves no empty paragraphs', t => {
  t.alike(parse('![x](x.png)').nodes.map(n => n.type), ['ImageNode'])
})

test('image nested in a link stays inline', t => {
  const [p] = parse('[![badge](b.svg)](https://x.org)').nodes
  t.is(p.type, 'Paragraph')
  t.is(p.children[0].type, 'Link')
  t.is(p.children[0].children[0].type, 'ImageNode')
})

test('unknown media settings are carried through', t => {
  t.is(parse('::video{src=a.mp4 loop=true width=320}').nodes[0].props.width, 320)
})
