/**
 * UnifiedCollector logic unit tests
 * 
 * Tests the pure functions extracted during the fix:
 * - tryQuickReplyMap: fast-path numbered reply → intent mapping
 * - detectAssetType: image vs video detection
 * - hasNumberedOptions: detect numbered option list in assistant messages
 *
 * Run: npx tsx src/lib/__tests__/unifiedCollector.test.ts
 */

// ──── Inline the pure functions under test ────
// (copied from UnifiedCollector.tsx to avoid JSX/React import issues)

type Intent = 'intel' | 'asset' | 'landing' | 'pipeline' | null
type ChatMsg = { role: 'user' | 'assistant'; content: string }

const NUMBERED_INTENT_MAP: Record<string, Intent> = {
  '1': 'intel',
  '2': 'asset',
  '3': 'landing',
  '4': 'pipeline',
}

const QUICK_REPLY_REGEX = /^([1-4])[.、)）\s]?/

function hasNumberedOptions(msgs: ChatMsg[]): boolean {
  const last = [...msgs].reverse().find(m => m.role === 'assistant')
  if (!last) return false
  return /[1-4][)）.、]/.test(last.content)
}

function tryQuickReplyMap(text: string, msgs: ChatMsg[]): Intent {
  if (!hasNumberedOptions(msgs)) return null
  const match = text.match(QUICK_REPLY_REGEX)
  if (!match) return null
  return NUMBERED_INTENT_MAP[match[1]] || null
}

function detectAssetType(text: string): 'image' | 'video' {
  const lower = text.toLowerCase()
  const videoPatterns = [
    /视频/, /video/, /\bclip\b/, /动画/, /\banimation\b/,
    /\bmotion\b/, /\bveo\b/, /短片/,
  ]
  return videoPatterns.some(p => p.test(lower)) ? 'video' : 'image'
}

// ──── Test runner ────

let passed = 0
let failed = 0

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg}`)
  }
}

function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual === expected) {
    passed++
    console.log(`  ✓ ${msg}`)
  } else {
    failed++
    console.error(`  ✗ ${msg} — expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}`)
  }
}

// ──── Test cases ────

console.log('\n=== hasNumberedOptions ===')

assertEqual(
  hasNumberedOptions([]),
  false,
  'empty messages → false'
)

assertEqual(
  hasNumberedOptions([{ role: 'user', content: 'hello' }]),
  false,
  'no assistant message → false'
)

assertEqual(
  hasNumberedOptions([
    { role: 'assistant', content: '请问您想要：1) 生成竞品情报报告 2) 生成营销素材 3) 生成落地页 4) 全套一键联动？' }
  ]),
  true,
  'Chinese numbered list with ) → true'
)

assertEqual(
  hasNumberedOptions([
    { role: 'assistant', content: 'Which: 1. Intel 2. Assets 3. Landing 4. Pipeline' }
  ]),
  true,
  'English numbered list with . → true'
)

assertEqual(
  hasNumberedOptions([
    { role: 'assistant', content: '1、情报 2、素材 3、落地页 4、一键联动' }
  ]),
  true,
  'Chinese numbered list with 、 → true'
)

assertEqual(
  hasNumberedOptions([
    { role: 'assistant', content: 'Please provide a URL for analysis.' }
  ]),
  false,
  'no numbered list → false'
)

assertEqual(
  hasNumberedOptions([
    { role: 'assistant', content: '1) first' },
    { role: 'user', content: 'hmm' },
    { role: 'assistant', content: 'What URL do you want?' },
  ]),
  false,
  'last assistant has no numbers → false (even if earlier one did)'
)


console.log('\n=== tryQuickReplyMap ===')

const numberedMsgs: ChatMsg[] = [
  { role: 'assistant', content: '请问您想要：1) 竞品情报 2) 营销素材 3) 落地页 4) 一键联动？' }
]

assertEqual(tryQuickReplyMap('1', numberedMsgs), 'intel', '"1" → intel')
assertEqual(tryQuickReplyMap('2', numberedMsgs), 'asset', '"2" → asset')
assertEqual(tryQuickReplyMap('3', numberedMsgs), 'landing', '"3" → landing')
assertEqual(tryQuickReplyMap('4', numberedMsgs), 'pipeline', '"4" → pipeline')

assertEqual(tryQuickReplyMap('2生成营销素材', numberedMsgs), 'asset', '"2生成营销素材" → asset')
assertEqual(tryQuickReplyMap('2.生成素材', numberedMsgs), 'asset', '"2.生成素材" → asset')
assertEqual(tryQuickReplyMap('2)素材', numberedMsgs), 'asset', '"2)素材" → asset')
assertEqual(tryQuickReplyMap('2）生成', numberedMsgs), 'asset', '"2）生成" → asset')
assertEqual(tryQuickReplyMap('2、素材', numberedMsgs), 'asset', '"2、素材" → asset')
assertEqual(tryQuickReplyMap('2 generate assets', numberedMsgs), 'asset', '"2 generate assets" → asset')

assertEqual(tryQuickReplyMap('5', numberedMsgs), null, '"5" → null (out of range)')
assertEqual(tryQuickReplyMap('0', numberedMsgs), null, '"0" → null (out of range)')
assertEqual(tryQuickReplyMap('hello', numberedMsgs), null, '"hello" → null (no number prefix)')
assertEqual(tryQuickReplyMap('我想要素材', numberedMsgs), null, '"我想要素材" → null (no number prefix)')

// No numbered options in conversation
const plainMsgs: ChatMsg[] = [
  { role: 'assistant', content: 'Please provide a URL.' }
]
assertEqual(tryQuickReplyMap('2', plainMsgs), null, '"2" with no numbered options → null')


console.log('\n=== detectAssetType ===')

assertEqual(detectAssetType('生成一张体育博彩的广告banner'), 'image', 'banner → image')
assertEqual(detectAssetType('casino welcome bonus image'), 'image', 'image keyword → image')
assertEqual(detectAssetType('make a promotional poster'), 'image', 'poster (default) → image')

assertEqual(detectAssetType('生成一个体育博彩视频'), 'video', '视频 → video')
assertEqual(detectAssetType('casino welcome bonus video'), 'video', 'video keyword → video')
assertEqual(detectAssetType('create an animation for esports'), 'video', 'animation → video')
assertEqual(detectAssetType('make a short clip for TikTok'), 'video', 'clip → video')
assertEqual(detectAssetType('用veo生成一个广告'), 'video', 'veo → video')
assertEqual(detectAssetType('做一个动画广告'), 'video', '动画 → video')


console.log('\n=== chatMode prompt extraction logic ===')

// Simulate the logic in handleSubmit that extracts original prompt
function extractOriginalPrompt(msgs: ChatMsg[]): string {
  const originalUserMsg = msgs.find(m => m.role === 'user')
  const originalPrompt = originalUserMsg?.content || ''
  const isVague = !originalPrompt || /^[0-9\s.\u3001)\uff09]+$/.test(originalPrompt.trim())
  return isVague ? '' : originalPrompt
}

assertEqual(
  extractOriginalPrompt([
    { role: 'user', content: '帮我做点东西' },
    { role: 'assistant', content: '请问您想要：1) 情报 2) 素材 3) 落地页 4) 一键联动？' },
    { role: 'user', content: '2' },
  ]),
  '帮我做点东西',
  'original user input "帮我做点东西" preserved (not "2")'
)

assertEqual(
  extractOriginalPrompt([
    { role: 'user', content: '生成一张体育博彩的广告banner' },
    { role: 'assistant', content: '请问您想要：1) ... 2) ...' },
    { role: 'user', content: '2' },
  ]),
  '生成一张体育博彩的广告banner',
  'detailed original prompt preserved for generation'
)

assertEqual(
  extractOriginalPrompt([
    { role: 'assistant', content: '请问您想要：1) ... 2) ...' },
    { role: 'user', content: '2' },
  ]),
  '',
  'only numbered reply → empty prompt (no auto-generate)'
)

assertEqual(
  extractOriginalPrompt([
    { role: 'user', content: '3' },
    { role: 'assistant', content: '...' },
    { role: 'user', content: '2' },
  ]),
  '',
  'original was also just a number → empty prompt'
)

assertEqual(
  extractOriginalPrompt([]),
  '',
  'empty conversation → empty prompt'
)


// ──── Summary ────

console.log(`\n${'='.repeat(40)}`)
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`)
console.log(`${'='.repeat(40)}\n`)

process.exit(failed > 0 ? 1 : 0)
