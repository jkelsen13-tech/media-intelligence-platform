// TopicBrowser Focus-flow coverage (2026-08-14). The component shipped
// 2026-07-27 with ZERO tests, which let the App.jsx prop-name mismatch
// (App passed `onSelect`, the component calls `onSelectTopic`) survive for
// 18 days: clicking Focus threw "onSelectTopic is not a function" and the
// topic subgraph never generated.
//
// Dependency-free by design (node --test only, no jsdom):
//   1. Render: the compiled component is server-rendered and the topic
//      list, inherited member counts, and Focus affordances are asserted.
//   2. Wiring contracts at BOTH ends of the boundary that actually broke:
//      App.jsx must pass the handler as `onSelectTopic`, and TopicBrowser's
//      Focus controls must invoke `onSelectTopic`. Fails on pre-fix source,
//      passes after — this is the test that catches the 2026-07-27 bug.
//   3. Behavioral click proof of the fixed build happens in a real browser
//      (Chromium) during acceptance: Focus -> panel closes, focus trail
//      crumb appears, topic subgraph renders. That end-to-end proof is
//      recorded in the session verifier log; it cannot live in node --test
//      without adding a DOM dependency.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')

// esbuild ships as a dependency of vite; resolve it through vite's own
// require context so the test does not rely on node_modules hoisting.
const viteRequire = createRequire(createRequire(import.meta.url).resolve('vite/package.json'))
const { transformSync } = viteRequire('esbuild')

// --- Compile the JSX component to a temp ESM file so node --test can
// import it (bare 'react' resolves normally from a real file path). ---
const compiledDir = join(here, '.compiled')
mkdirSync(compiledDir, { recursive: true })
const jsxSrc = readFileSync(join(repoRoot, 'src/graph/TopicBrowser.jsx'), 'utf8')
const { code } = transformSync(jsxSrc, {
  loader: 'jsx',
  jsx: 'transform', // classic: emits React.createElement with React in scope
  format: 'esm',
})
const compiledPath = join(compiledDir, 'TopicBrowser.compiled.mjs')
writeFileSync(compiledPath, "import React from 'react'\n" + code)
const { default: TopicBrowser } = await import(compiledPath)

const React = (await import('react')).default
const { renderToStaticMarkup } = await import('react-dom/server')

// Fixture: Governance (parent) > Elections (child); Technology is a leaf.
const topicsData = {
  topics: [
    { id: 't1', slug: 'governance', name: 'Governance', parent_id: null },
    { id: 't2', slug: 'technology', name: 'Technology', parent_id: null },
    { id: 't3', slug: 'elections', name: 'Elections', parent_id: 't1' },
  ],
  nodeTopics: [
    { node_id: 'n1', topic_id: 't1', confidence: 0.9 },
    { node_id: 'n2', topic_id: 't3', confidence: 0.8 },
    { node_id: 'n3', topic_id: 't2', confidence: 0.7 },
  ],
}

function render(extraProps = {}) {
  return renderToStaticMarkup(
    React.createElement(TopicBrowser, {
      topicsData,
      onSelectTopic: () => {},
      onClose: () => {},
      ...extraProps,
    }),
  )
}

test('renders top-level topics with member counts (parent inherits child members)', () => {
  const html = render()
  assert.match(html, /Governance/, 'parent topic listed')
  assert.match(html, /Technology/, 'leaf topic listed')
  assert.doesNotMatch(html, /Elections/, 'child hidden until drill-in')
  // Governance count = direct member n1 + inherited child member n2 = 2.
  assert.match(html, /Governance.*?2/s, 'Governance shows inherited count 2')
  assert.match(html, /Technology.*?1/s, 'Technology shows count 1')
})

test('every topic row renders an enabled Focus control (non-empty branch)', () => {
  const html = render()
  const focusButtons = html.match(/topic-focus-btn/g) ?? []
  assert.equal(focusButtons.length, 2, 'one Focus button per listed topic')
  assert.doesNotMatch(html, /topic-focus-btn[^>]*disabled/, 'no disabled Focus with members present')
})

test('Focus control is disabled only when the topic has zero members', () => {
  const html = render({
    topicsData: {
      topics: [{ id: 't9', slug: 'empty', name: 'Empty Topic', parent_id: null }],
      nodeTopics: [],
    },
  })
  assert.match(html, /topic-focus-btn[^>]*disabled/, 'zero-member topic Focus is disabled')
})

test('wiring contract, App end: App.jsx passes the prop under the name TopicBrowser destructures', () => {
  // The 2026-07-27 → 2026-08-14 bug: App passed onSelect={handleSelectTopic}
  // while TopicBrowser destructures onSelectTopic — Focus was a dead button.
  const appSrc = readFileSync(join(repoRoot, 'src/App.jsx'), 'utf8')
  const block = appSrc.match(/<TopicBrowser[\s\S]*?\/>/)
  assert.ok(block, 'App.jsx renders <TopicBrowser>')
  assert.match(
    block[0],
    /onSelectTopic=\{handleSelectTopic\}/,
    'App must pass the selection handler as onSelectTopic',
  )
  assert.ok(!/onSelect=\{/.test(block[0]), 'stale onSelect prop must not return')
})

test('wiring contract, component end: every Focus affordance invokes onSelectTopic', () => {
  const src = readFileSync(join(repoRoot, 'src/graph/TopicBrowser.jsx'), 'utf8')
  const invokes = src.match(/onSelectTopic\(\{/g) ?? []
  // Per-topic Focus button and the drilled-in "Focus graph on …" button.
  assert.ok(invokes.length >= 2, 'Focus controls call onSelectTopic with a payload')
  assert.match(src, /\{\s*topicsData,\s*onSelectTopic,\s*onClose\s*\}/, 'prop destructured by that exact name')
})

test('cleanup compiled temp', () => {
  rmSync(compiledDir, { recursive: true, force: true })
})
