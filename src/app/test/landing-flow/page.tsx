'use client'

/**
 * /test/landing-flow — End-to-end visual test of the Landing page post-report
 * render flow WITHOUT hitting the real /api/brief/execute endpoint.
 *
 * Simulates the exact state machine in src/app/brief/execute/page.tsx:
 *   pending → generating (skeleton stream) → generating (real HTML stream) → done
 *
 * Lets you verify:
 *   - Skeleton HTML starts streaming immediately (no "Building page..." gap)
 *   - Real HTML replaces skeleton cleanly once "API" resolves
 *   - CodeStreamView fills the card (no empty white area below)
 *   - "Preview on Device" opens the new sidebar-layout DevicePreviewModal
 *   - Device list groups by brand (iPhone / Samsung / Pixel / Other / Tablet / Desktop)
 *   - Every device renders a FULL frame (not clipped)
 *
 * Visit: http://localhost:3000/test/landing-flow
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { FileText, Copy, Eye, Smartphone, CheckCircle2, Play, RefreshCw } from 'lucide-react'
import DevicePreviewModal from '@/components/DevicePreviewModal'
import { SAMPLE_LANDING_PAGE_HTML } from '@/lib/testFixtures/sampleLandingPage'

// ── Apple colour tokens (match brief/execute/page.tsx) ──
const C = {
  black: '#1d1d1f',
  white: '#ffffff',
  blue: '#0071e3',
  brightBlue: '#2997ff',
  lightGray: '#f5f5f7',
  text48: 'rgba(0,0,0,0.48)',
  text80: 'rgba(0,0,0,0.8)',
}

type Phase = 'pending' | 'generating' | 'done'

// Skeleton that appears IMMEDIATELY on click — mirrors brief/execute runLandingGeneration.
const SKELETON_LINES = [
  '<!DOCTYPE html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="UTF-8" />',
  '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
  '  <title>Landing Page — Generating...</title>',
  '  <style>',
  '    :root { --brand: #0071e3; --bg: #0a0a0f; --text: #ffffff; }',
  '    * { box-sizing: border-box; margin: 0; padding: 0; }',
  '    body { font-family: -apple-system, Inter, sans-serif; background: var(--bg); color: var(--text); }',
  '    .hero { min-height: 90vh; display: flex; flex-direction: column; justify-content: center; padding: 5%; }',
  '    .cta { background: var(--brand); color: white; padding: 16px 40px; border-radius: 980px; }',
  '  </style>',
  '</head>',
  '<body>',
  '  <section class="hero">',
  '    <h1>Generating hero content...</h1>',
  '    <p>AI is writing personalized copy for this audience.</p>',
  '    <a href="#" class="cta">Call to Action</a>',
  '  </section>',
  '</body>',
  '</html>',
]

const LANDING_STEPS = [
  'Analyzing audience',
  'Selecting template',
  'Writing hero copy',
  'Styling components',
  'Rendering HTML',
]

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export default function LandingFlowTestPage() {
  const [phase, setPhase] = useState<Phase>('pending')
  const [step, setStep] = useState(0)
  const [codeLines, setCodeLines] = useState<string[]>([])
  const [codeVisible, setCodeVisible] = useState(0)
  const [finalHtml, setFinalHtml] = useState<string>('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [mockLatency, setMockLatency] = useState(4000)

  // Cancellation token so a fresh run cleanly invalidates any in-flight animation.
  const runIdRef = useRef(0)

  const runFlow = useCallback(async () => {
    const runId = ++runIdRef.current
    const alive = () => runIdRef.current === runId

    // Reset
    setPhase('generating')
    setStep(0)
    setFinalHtml('')
    setCodeLines(SKELETON_LINES)
    setCodeVisible(0)

    // 1. Skeleton streaming — starts IMMEDIATELY, 90ms per line
    ;(async () => {
      for (let l = 1; l <= SKELETON_LINES.length; l++) {
        await sleep(90)
        if (!alive()) return
        setCodeVisible(l)
      }
    })()

    // 2. Fake "thinking step" progression across LANDING_STEPS
    ;(async () => {
      for (let s = 0; s < LANDING_STEPS.length; s++) {
        await sleep(mockLatency / LANDING_STEPS.length)
        if (!alive()) return
        setStep(s)
      }
    })()

    // 3. Wait for mock latency → "API returns"
    await sleep(mockLatency)
    if (!alive()) return

    // 4. Real HTML replaces skeleton, stream it in at ~40 batches
    const lines = SAMPLE_LANDING_PAGE_HTML.split('\n')
    setCodeLines(lines)
    setCodeVisible(0)
    const batchSize = Math.max(1, Math.ceil(lines.length / 40))
    for (let l = 0; l < lines.length; l += batchSize) {
      await sleep(60)
      if (!alive()) return
      setCodeVisible(Math.min(l + batchSize, lines.length))
    }

    if (!alive()) return
    setFinalHtml(SAMPLE_LANDING_PAGE_HTML)
    setCodeVisible(lines.length)
    setPhase('done')
  }, [mockLatency])

  const reset = () => {
    runIdRef.current++ // cancel any in-flight run
    setPhase('pending')
    setStep(0)
    setCodeLines([])
    setCodeVisible(0)
    setFinalHtml('')
    setPreviewOpen(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.lightGray, padding: 32,
      fontFamily: '-apple-system, "SF Pro Display", system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        {/* Page title + controls */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, letterSpacing: -0.5 }}>
            Landing Page Flow — Test Harness
          </h1>
          <p style={{ fontSize: 14, color: '#666', marginBottom: 16 }}>
            Simulates the <code style={{ background: '#eee', padding: '1px 6px', borderRadius: 4 }}>
              brief/execute
            </code>{' '}
            landing-page render pipeline using the bundled{' '}
            <code style={{ background: '#eee', padding: '1px 6px', borderRadius: 4 }}>
              SAMPLE_LANDING_PAGE_HTML
            </code>{' '}
            fixture. No network calls.
          </p>

          {/* Phase badge + controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <PhaseBadge phase={phase} />

            <button
              onClick={runFlow}
              disabled={phase === 'generating'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: phase === 'generating' ? '#ccc' : C.blue,
                color: C.white, border: 'none', borderRadius: 980,
                padding: '10px 22px', fontSize: 14, fontWeight: 600,
                cursor: phase === 'generating' ? 'not-allowed' : 'pointer',
              }}
            >
              <Play size={14} />
              {phase === 'pending' ? 'Start simulated generation' : 'Re-run'}
            </button>

            <button
              onClick={reset}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'transparent', color: '#333',
                border: '1px solid #d2d2d7', borderRadius: 980,
                padding: '10px 18px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
              }}
            >
              <RefreshCw size={13} />
              Reset
            </button>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#555' }}>
              Mock API latency
              <select
                value={mockLatency}
                onChange={(e) => setMockLatency(Number(e.target.value))}
                style={{
                  padding: '6px 10px', borderRadius: 6, border: '1px solid #d2d2d7',
                  background: '#fff', fontSize: 13,
                }}
              >
                <option value={1000}>1s (fast)</option>
                <option value={2500}>2.5s</option>
                <option value={4000}>4s (typical)</option>
                <option value={8000}>8s (slow)</option>
              </select>
            </label>
          </div>
        </div>

        {/* Landing Page Card — mirrors the RIGHT card in brief/execute/page.tsx */}
        <div style={{
          background: C.white, borderRadius: 12, overflow: 'hidden',
          boxShadow: 'rgba(0,0,0,0.08) 0 4px 20px',
        }}>
          {/* Header */}
          <div style={{
            background: C.black, color: C.white, padding: '14px 20px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={14} color={C.brightBlue} />
              <span style={{
                fontSize: 12, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: 0.5, color: C.brightBlue,
              }}>
                Landing Page
              </span>
            </div>
            {phase === 'done' && finalHtml && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(finalHtml)}
                  style={headerBtn}
                >
                  <Copy size={10} /> Copy
                </button>
                <button
                  onClick={() => setPreviewOpen(true)}
                  style={{
                    ...headerBtn,
                    background: 'rgba(41,151,255,0.15)',
                    borderColor: C.brightBlue,
                    color: C.brightBlue,
                  }}
                >
                  <Eye size={10} /> Preview
                </button>
              </div>
            )}
          </div>

          {/* Body */}
          <div style={{ padding: 0 }}>
            {phase === 'pending' && (
              <div style={{
                height: 420, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.text48, fontSize: 14, padding: 16, flexDirection: 'column', gap: 8,
              }}>
                <FileText size={32} color="#ddd" />
                <div>Waiting — press <strong>Start simulated generation</strong> above.</div>
              </div>
            )}

            {phase === 'generating' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', minHeight: 420 }}>
                <MiniThinkingSteps steps={LANDING_STEPS} currentStep={step} />
                <CodeStreamView lines={codeLines} visibleCount={codeVisible} />
              </div>
            )}

            {phase === 'done' && finalHtml && (
              <div style={{
                position: 'relative', display: 'flex', flexDirection: 'column',
                minHeight: 420, padding: 16,
              }}>
                <CodeStreamView lines={codeLines} visibleCount={codeVisible} />
                <div style={{
                  position: 'absolute', bottom: 20, left: '50%',
                  transform: 'translateX(-50%)',
                }}>
                  <button
                    onClick={() => setPreviewOpen(true)}
                    style={{
                      background: C.blue, color: C.white, border: 'none', borderRadius: 980,
                      padding: '8px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                      boxShadow: '0 4px 12px rgba(0,113,227,0.4)',
                    }}
                  >
                    <Smartphone size={14} /> Preview on Device
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Checklist */}
        <div style={{
          marginTop: 24, background: C.white, border: '1px solid #e6e6e6',
          borderRadius: 12, padding: 20,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            Verify (expected)
          </h2>
          <ol style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: '#333', margin: 0 }}>
            <li>Click <strong>Start</strong> → code starts streaming <em>within 100ms</em> (skeleton HTML).</li>
            <li>Thinking steps progress through 5 stages during the mock latency.</li>
            <li>When the "API" resolves, skeleton is replaced by real HTML without flicker.</li>
            <li>Code panel fills the card — no empty white area below the code.</li>
            <li><strong>Preview on Device</strong> opens a modal with <em>device list on the left</em>, full frame on the right.</li>
            <li>Left list is grouped: <strong>iPhone · Samsung · Pixel · Other Android · Tablet · Desktop</strong>.</li>
            <li>Every device shows the full frame (not clipped), including iPad Pro 13&quot; and Desktop 1440p.</li>
            <li>iframe loads the landing page (scroll inside the phone to see all sections).</li>
          </ol>
        </div>
      </div>

      {/* Animation keyframes for code streaming cursor */}
      <style jsx global>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.2; } }
      `}</style>

      {previewOpen && (
        <DevicePreviewModal
          html={finalHtml}
          title="Landing Page Test Harness"
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════
   Sub-components (duplicated minimally from brief/execute
   so the test page stays self-contained)
   ═══════════════════════════════════════════ */

function PhaseBadge({ phase }: { phase: Phase }) {
  const map = {
    pending: { label: 'PENDING', bg: '#eee', fg: '#666' },
    generating: { label: 'GENERATING', bg: 'rgba(0,113,227,0.1)', fg: C.blue },
    done: { label: 'DONE', bg: 'rgba(48,209,88,0.12)', fg: '#1c7f3e' },
  } as const
  const s = map[phase]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 980,
      background: s.bg, color: s.fg, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
    }}>
      {phase === 'done' && <CheckCircle2 size={12} />}
      {s.label}
    </span>
  )
}

function MiniThinkingSteps({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
      {steps.map((s, i) => {
        const done = i < currentStep
        const active = i === currentStep
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: done ? '#30d158' : active ? C.blue : '#e5e5e7',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 9, fontWeight: 700, flexShrink: 0,
            }}>
              {done ? '✓' : ''}
            </div>
            <span style={{
              color: active ? '#111' : done ? '#666' : '#aaa',
              fontWeight: active ? 600 : 400,
            }}>
              {s}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CodeStreamView({ lines, visibleCount }: { lines: string[]; visibleCount: number }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [visibleCount])

  return (
    <div
      ref={scrollRef}
      style={{
        background: '#1a1a2e', borderRadius: 8, padding: '12px 16px',
        flex: 1, minHeight: 320, maxHeight: '60vh', width: '100%',
        overflowY: 'auto', marginTop: 12,
        fontFamily: '"SF Mono", "Fira Code", "Menlo", monospace',
        fontSize: 11, lineHeight: 1.6, color: '#a0a0b8',
      }}
    >
      {lines.slice(0, visibleCount).map((line, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: '#4a4a5c', minWidth: 28, textAlign: 'right', userSelect: 'none' }}>
            {idx + 1}
          </span>
          <span style={{
            color: line.includes('<') ? '#7dd3fc'
              : line.includes('{') || line.includes('}') ? '#c084fc'
              : line.includes(':') ? '#86efac'
              : '#a0a0b8',
          }}>
            {line || ' '}
          </span>
        </div>
      ))}
      {visibleCount < lines.length && (
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ color: '#4a4a5c', minWidth: 28, textAlign: 'right' }}>{visibleCount + 1}</span>
          <span style={{ color: C.brightBlue, animation: 'blink 1s infinite' }}>▋</span>
        </div>
      )}
    </div>
  )
}

const headerBtn: React.CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,0.2)',
  color: 'rgba(255,255,255,0.6)', borderRadius: 6,
  padding: '3px 8px', cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 4, fontSize: 10,
}
