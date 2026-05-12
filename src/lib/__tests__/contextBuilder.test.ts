/**
 * Context Builder unit tests
 *
 * Run: npx tsx src/lib/__tests__/contextBuilder.test.ts
 */

import { buildGenerationPrompt, type ProjectContext } from '../contextBuilder'
import { CONTEXT_DEFAULTS } from '../contextConfig'

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ ${msg}`) }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ ${msg} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`) }
}

// ──── Test: no context ────

console.log('\n=== No context (simple prompt) ===')

const r1 = buildGenerationPrompt('casino banner 1200x628', 'image', null)
assertEqual(r1.messages.length, 1, 'single message (no system prompt)')
assertEqual(r1.messages[0].role, 'user', 'role is user')
assertEqual(r1.messages[0].content, 'casino banner 1200x628', 'content is prompt')
assertEqual(r1.meta.contextMessagesUsed, 0, 'no context messages')
assertEqual(r1.meta.assetsIncluded, 0, 'no assets')


// ──── Test: with project context ────

console.log('\n=== With project context ===')

const ctx: ProjectContext = {
  projectId: 'proj-1',
  projectName: 'Casino Campaign Q4',
  messages: [
    { role: 'user', content: '生成一张赌场banner', timestamp: '2026-05-12T10:00:00Z' },
    { role: 'assistant', content: 'Generated casino banner with red/gold theme' },
    { role: 'user', content: '再做一个视频版本', timestamp: '2026-05-12T10:05:00Z' },
  ],
  assets: [
    { type: 'image', prompt: '赌场banner红金主题', createdAt: '2026-05-12T10:01:00Z', evaluationSummary: 'overall: 8.5' },
  ],
  brief: {
    productName: 'BetKing Casino',
    vertical: 'iGaming / Casino',
    targetAudience: 'Male 25-45, high-income',
    tone: 'Luxurious, exciting',
    style: 'Dark with gold accents',
  },
}

const r2 = buildGenerationPrompt('create matching video ad 30s', 'video', ctx)

// Should have system + history + current user message
assert(r2.messages.length >= 3, `messages include system + history + user (got ${r2.messages.length})`)
assertEqual(r2.messages[0].role, 'system', 'first message is system')
assert(r2.messages[0].content.includes('video ad creative'), 'system prompt mentions video')
assert(r2.messages[0].content.includes('BetKing Casino'), 'system prompt includes brand name')
assert(r2.messages[0].content.includes('iGaming'), 'system prompt includes vertical')
assert(r2.messages[0].content.includes('Male 25-45'), 'system prompt includes audience')
assert(r2.messages[0].content.includes('Luxurious'), 'system prompt includes tone')
assert(r2.messages[0].content.includes('赌场banner红金主题'), 'system prompt includes previous asset')
assert(r2.messages[0].content.includes('overall: 8.5'), 'system prompt includes evaluation')
assert(r2.messages[0].content.includes('consistency'), 'system prompt instructs consistency')

// Last message should be the current prompt
const lastMsg = r2.messages[r2.messages.length - 1]
assertEqual(lastMsg.role, 'user', 'last message is user')
assertEqual(lastMsg.content, 'create matching video ad 30s', 'last message is current prompt')

// Meta
assert(r2.meta.contextMessagesUsed > 0, 'context messages used > 0')
assertEqual(r2.meta.assetsIncluded, 1, '1 asset included')


// ──── Test: history trimming ────

console.log('\n=== History trimming (maxContextMessages) ===')

const longCtx: ProjectContext = {
  projectId: 'proj-2',
  projectName: 'Test',
  messages: Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `Message ${i}: ${'x'.repeat(100)}`,
  })),
  assets: [],
}

const r3 = buildGenerationPrompt('next', 'image', longCtx, { maxContextMessages: 4 })
// Should have system + 4 history + 1 current = 6 messages
assertEqual(r3.meta.contextMessagesUsed, 4, 'only 4 history messages (limited)')
assertEqual(r3.messages.length, 6, 'system + 4 history + 1 current = 6')


// ──── Test: char limit trimming ────

console.log('\n=== Char limit trimming ===')

const r4 = buildGenerationPrompt('go', 'image', longCtx, { maxContextMessages: 20, maxContextChars: 500 })
assert(r4.meta.estimatedChars <= 500, `total chars ${r4.meta.estimatedChars} <= 500`)
assert(r4.meta.contextMessagesUsed < 20, `trimmed to ${r4.meta.contextMessagesUsed} messages`)


// ──── Test: excludes generation status messages ────

console.log('\n=== Filters out generation status messages ===')

const statusCtx: ProjectContext = {
  projectId: 'proj-3',
  projectName: 'Test',
  messages: [
    { role: 'user', content: '生成banner' },
    { role: 'assistant', content: 'Generating image with NanoBanana Pro...' },
    { role: 'assistant', content: 'Running D1-D4 creative evaluation...' },
    { role: 'assistant', content: 'Great banner with vivid colors!' },
    { role: 'user', content: '再做一个' },
  ],
  assets: [],
}

const r5 = buildGenerationPrompt('video version', 'video', statusCtx)
// Should NOT include "Generating..." and "Running D1-D4..." messages
const historyContents = r5.messages
  .filter(m => m.role !== 'system')
  .map(m => m.content)
  .slice(0, -1) // exclude current prompt

assert(!historyContents.some(c => c.startsWith('Generating')), 'no "Generating..." in history')
assert(!historyContents.some(c => c.startsWith('Running D1-D4')), 'no "Running D1-D4..." in history')
assert(historyContents.some(c => c.includes('Great banner')), 'includes real assistant response')


// ──── Test: no asset summary when disabled ────

console.log('\n=== Asset summary disabled ===')

const r6 = buildGenerationPrompt('test', 'image', ctx, { includeAssetSummary: false })
assert(!r6.messages[0].content.includes('Previously Generated'), 'no asset summary when disabled')


// ──── Summary ────

console.log(`\n${'='.repeat(50)}`)
console.log(`Context Builder: ${passed + failed} total | ${passed} passed | ${failed} failed`)
console.log(`${'='.repeat(50)}\n`)

process.exit(failed > 0 ? 1 : 0)
