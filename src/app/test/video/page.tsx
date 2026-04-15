'use client'

/**
 * /test/video — Unit/integration test page for the report-page video player.
 *
 * Verifies the two bugs fixed in this session:
 *   1. Video plays (CSP allows external media-src)
 *   2. Video has sound (no `muted` attribute forcing silent playback)
 *
 * Visit: http://localhost:3000/test/video
 *
 * Fixtures:
 *   - Big Buck Bunny (Google CDN MP4 with audio) — proves external https: sources play + have sound
 *   - Custom URL — paste any video URL (e.g. an OpenRouter VEO output)
 *   - Live submit — calls /api/generate-video to do a true end-to-end VEO 3.1 test
 */

import { useState, useRef } from 'react'

// Well-known public MP4 with an audio track. If you hear sound here, the
// report page will too (same <video> attributes, same CSP).
const SAMPLE_VIDEO_WITH_AUDIO = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'

type JobStatus = 'idle' | 'submitting' | 'polling' | 'completed' | 'failed'

export default function VideoTestPage() {
  const [src, setSrc] = useState<string>(SAMPLE_VIDEO_WITH_AUDIO)
  const [customUrl, setCustomUrl] = useState<string>('')
  const videoRef = useRef<HTMLVideoElement | null>(null)

  // Live VEO submission state
  const [prompt, setPrompt] = useState<string>('A 5-second cinematic shot of a sunset over the ocean, with gentle wave sounds')
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle')
  const [jobId, setJobId] = useState<string>('')
  const [jobError, setJobError] = useState<string>('')
  const [pollCount, setPollCount] = useState<number>(0)

  const loadSample = () => setSrc(SAMPLE_VIDEO_WITH_AUDIO)
  const loadCustom = () => { if (customUrl.trim()) setSrc(customUrl.trim()) }

  const submitVeoJob = async () => {
    setJobStatus('submitting')
    setJobError('')
    setJobId('')
    setPollCount(0)
    try {
      const res = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'submit', prompt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setJobId(data.jobId)
      setJobStatus('polling')
      pollJob(data.jobId)
    } catch (e: unknown) {
      setJobError(e instanceof Error ? e.message : String(e))
      setJobStatus('failed')
    }
  }

  const pollJob = async (id: string) => {
    let attempts = 0
    const maxAttempts = 120 // ~10 minutes at 5s interval
    const tick = async () => {
      attempts++
      setPollCount(attempts)
      try {
        const res = await fetch('/api/generate-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'poll', jobId: id }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)

        if (data.status === 'completed' || data.status === 'succeeded') {
          // Download
          const dlRes = await fetch('/api/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'download', jobId: id }),
          })
          const dlData = await dlRes.json()
          if (!dlRes.ok) throw new Error(dlData.error || `HTTP ${dlRes.status}`)
          setSrc(dlData.videoData || dlData.videoUrl)
          setJobStatus('completed')
          return
        }
        if (data.status === 'failed' || data.status === 'error') {
          throw new Error(`Job failed: ${JSON.stringify(data.raw || data)}`)
        }
        if (attempts >= maxAttempts) throw new Error('Polling timed out')
        setTimeout(tick, 5000)
      } catch (e: unknown) {
        setJobError(e instanceof Error ? e.message : String(e))
        setJobStatus('failed')
      }
    }
    tick()
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f7', padding: 40, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
          Video Playback — Test Harness
        </h1>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
          Verifies the report-page <code>&lt;video&gt;</code> element plays external sources <em>with audio</em>.
          Uses the same attributes as the production player (<code>controls</code>, <code>loop</code>, <code>playsInline</code>, no <code>muted</code>).
        </p>

        {/* Fixture selector */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={loadSample} style={btn}>Big Buck Bunny (MP4 + audio)</button>
          <input
            type="text"
            placeholder="Paste a video URL or data: URL"
            value={customUrl}
            onChange={(e) => setCustomUrl(e.target.value)}
            style={{ flex: 1, minWidth: 260, padding: '8px 12px', fontSize: 13, border: '1px solid #d2d2d7', borderRadius: 8 }}
          />
          <button onClick={loadCustom} style={btn}>Load URL</button>
        </div>

        {/* Video element — mirrors production markup exactly */}
        <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
          <video
            ref={videoRef}
            key={src}
            src={src}
            controls
            loop
            playsInline
            preload="metadata"
            style={{ width: '100%', height: 'auto', display: 'block', background: '#000' }}
          />
        </div>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 24, wordBreak: 'break-all' }}>
          <strong>Current src:</strong> {src.length > 120 ? src.slice(0, 120) + '…' : src}
        </div>

        {/* Live VEO submission */}
        <div style={{
          background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12,
          padding: 20, marginBottom: 20,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>End-to-end: generate a new video via VEO 3.1</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            style={{
              width: '100%', padding: 10, fontSize: 13,
              border: '1px solid #ddd', borderRadius: 8, marginBottom: 10,
              fontFamily: 'inherit', resize: 'vertical',
            }}
          />
          <button
            onClick={submitVeoJob}
            disabled={jobStatus === 'submitting' || jobStatus === 'polling'}
            style={{
              background: jobStatus === 'submitting' || jobStatus === 'polling' ? '#999' : '#0071e3',
              color: '#fff', border: 'none',
              padding: '10px 24px', fontSize: 14, fontWeight: 600,
              borderRadius: 980, cursor: jobStatus === 'submitting' || jobStatus === 'polling' ? 'not-allowed' : 'pointer',
            }}
          >
            {jobStatus === 'idle' && '▶ Submit to VEO 3.1'}
            {jobStatus === 'submitting' && 'Submitting…'}
            {jobStatus === 'polling' && `Polling… (attempt ${pollCount})`}
            {jobStatus === 'completed' && '✓ Done — try resubmit'}
            {jobStatus === 'failed' && 'Failed — try again'}
          </button>
          {jobId && (
            <div style={{ marginTop: 10, fontSize: 12, color: '#666' }}>
              Job ID: <code>{jobId}</code>
            </div>
          )}
          {jobError && (
            <div style={{ marginTop: 10, padding: 10, background: '#fff0f0', border: '1px solid #ffb4b4', borderRadius: 8, color: '#c00', fontSize: 13 }}>
              {jobError}
            </div>
          )}
        </div>

        {/* Expected behaviour */}
        <div style={{
          background: '#fff', border: '1px solid #e6e6e6', borderRadius: 12,
          padding: 20,
        }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Expected behaviour</h2>
          <ol style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.8, color: '#333' }}>
            <li>The Big Buck Bunny sample loads and shows a first-frame poster within ~2 seconds.</li>
            <li>Clicking the play control starts playback <strong>with audible sound</strong> (prove the <code>muted</code> fix).</li>
            <li>Browser devtools → Network shows the .mp4 request succeeding (no CSP violation — proves <code>media-src https:</code> fix).</li>
            <li>Devtools → Console shows <em>no</em> <code>Content Security Policy</code> errors about media.</li>
            <li>Clicking <em>Submit to VEO 3.1</em> returns a job ID, polls to completion, and the resulting video plays here.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

const btn: React.CSSProperties = {
  background: '#fff', color: '#333', border: '1px solid #d2d2d7',
  padding: '8px 14px', fontSize: 13, fontWeight: 500,
  borderRadius: 8, cursor: 'pointer',
}
