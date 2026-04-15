'use client'

/**
 * /test/preview — Unit/integration test page for DevicePreviewModal.
 *
 * This page uses a hardcoded landing-page HTML fixture so you can verify
 * the preview pipeline without needing a live brief-execute run.
 *
 * Visit: http://localhost:3000/test/preview
 *
 * Tests covered:
 *   1. Modal renders when opened
 *   2. iframe loads the HTML via blob URL (no CSP inheritance)
 *   3. Device switcher changes iframe dimensions
 *   4. Scripts run inside the sandboxed iframe (click CTA → text changes)
 *   5. HTML edit reloads the iframe
 *   6. Escape and outside-click close the modal
 *
 * If any of these fail, read the notes under each test case.
 */

import { useState } from 'react'
import DevicePreviewModal from '@/components/DevicePreviewModal'
import { SAMPLE_LANDING_PAGE_HTML } from '@/lib/testFixtures/sampleLandingPage'

const MINIMAL_HTML = `<!DOCTYPE html>
<html><body style="font-family:sans-serif;padding:24px">
<h1>Minimal test page</h1>
<p>If you see this inside the phone frame, blob-URL preview works.</p>
<button onclick="document.body.style.background='#00d26a'">Click me → turn green</button>
</body></html>`

export default function PreviewTestPage() {
  const [open, setOpen] = useState(false)
  const [html, setHtml] = useState(SAMPLE_LANDING_PAGE_HTML)
  const [fixture, setFixture] = useState<'full' | 'minimal' | 'custom'>('full')

  const loadFixture = (name: 'full' | 'minimal' | 'custom') => {
    setFixture(name)
    if (name === 'full') setHtml(SAMPLE_LANDING_PAGE_HTML)
    if (name === 'minimal') setHtml(MINIMAL_HTML)
    // 'custom' keeps the current textarea content
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', padding: 40, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Landing Page Preview — Test Harness
        </h1>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
          Verifies that <code>DevicePreviewModal</code> can render generated landing-page HTML
          inside an iframe without being blocked by the app&apos;s Content Security Policy.
        </p>

        {/* Fixture selector */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <button
            onClick={() => loadFixture('full')}
            style={fixture === 'full' ? activeBtn : btn}
          >
            Full landing page fixture
          </button>
          <button
            onClick={() => loadFixture('minimal')}
            style={fixture === 'minimal' ? activeBtn : btn}
          >
            Minimal HTML
          </button>
          <button
            onClick={() => loadFixture('custom')}
            style={fixture === 'custom' ? activeBtn : btn}
          >
            Custom (edit below)
          </button>
        </div>

        {/* HTML editor */}
        <textarea
          value={html}
          onChange={(e) => { setHtml(e.target.value); setFixture('custom') }}
          spellCheck={false}
          style={{
            width: '100%', height: 220, padding: 12,
            fontFamily: 'Menlo, Monaco, monospace', fontSize: 12,
            border: '1px solid #ddd', borderRadius: 8, background: '#fff',
            resize: 'vertical',
          }}
        />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, marginBottom: 32 }}>
          <button
            onClick={() => setOpen(true)}
            style={{
              background: '#0071e3', color: '#fff', border: 'none',
              padding: '12px 28px', fontSize: 15, fontWeight: 600,
              borderRadius: 980, cursor: 'pointer',
            }}
          >
            ▶ Open Preview Modal
          </button>
          <div style={{ fontSize: 12, color: '#888', alignSelf: 'center' }}>
            HTML length: <strong>{html.length.toLocaleString()}</strong> chars
          </div>
        </div>

        {/* Expected behaviour checklist */}
        <div style={{
          background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12,
          padding: 20,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Expected behaviour</h2>
          <ol style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: '#333' }}>
            <li>Modal opens with dark backdrop, iPhone 15 Pro frame visible.</li>
            <li>Inside the phone frame, the landing page renders in full color (not blank, not just a loading spinner).</li>
            <li>Clicking device chips (iPhone SE, iPad Air, Desktop) resizes the iframe.</li>
            <li>
              For the full fixture: clicking the green <em>&quot;Claim $500 Welcome Bonus&quot;</em> button
              inside the phone changes its text — this proves scripts execute in the iframe sandbox.
            </li>
            <li>Pressing <kbd>Esc</kbd> or clicking the dark backdrop closes the modal.</li>
          </ol>
        </div>
      </div>

      {open && (
        <DevicePreviewModal
          html={html}
          title={fixture === 'full' ? 'BetMaster Pro (fixture)' : fixture === 'minimal' ? 'Minimal HTML' : 'Custom HTML'}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

const btn: React.CSSProperties = {
  background: '#fff', color: '#333', border: '1px solid #d2d2d7',
  padding: '8px 14px', fontSize: 13, fontWeight: 500,
  borderRadius: 8, cursor: 'pointer',
}

const activeBtn: React.CSSProperties = {
  ...btn,
  background: '#0071e3',
  color: '#fff',
  borderColor: '#0071e3',
}
