'use client'

/**
 * DevicePreviewModal — full-screen overlay that previews a landing page HTML
 * string inside a device mockup.
 *
 * Layout:
 *   ┌───────────────────────────────────────────────┐
 *   │ Top toolbar: title, html bytes, close        │
 *   ├──────────────┬────────────────────────────────┤
 *   │ Device list  │                                │
 *   │ (grouped)    │   Device frame (full-size,     │
 *   │              │    centred, scaled to fit)     │
 *   │ • iPhone     │                                │
 *   │ • Samsung    │                                │
 *   │ • Pixel      │                                │
 *   │ • Tablet     │                                │
 *   │ • Desktop    │                                │
 *   └──────────────┴────────────────────────────────┘
 *
 * Why blob URLs instead of srcDoc:
 *   srcDoc iframes inherit the parent page's CSP, which blocks most
 *   landing page content. Blob URLs have an independent opaque origin, so
 *   the iframe is not subject to the parent's strict CSP.
 */

import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import { X, Smartphone, Tablet, Monitor, Eye } from 'lucide-react'

export type DevicePreset = {
  id: string
  label: string
  brand: string
  icon: typeof Smartphone
  width: number
  height: number
  radius: number
  notch: boolean
}

/**
 * DEVICE_PRESETS — mainstream devices grouped by brand.
 * Ordered by market share / popularity within each brand.
 * Dimensions are the CSS viewport px (NOT physical pixels).
 */
export const DEVICE_PRESETS: readonly DevicePreset[] = [
  // Apple iPhone (latest first)
  { id: 'iphone15promax', label: 'iPhone 15 Pro Max', brand: 'iPhone', icon: Smartphone, width: 430, height: 932, radius: 52, notch: true },
  { id: 'iphone15pro', label: 'iPhone 15 Pro', brand: 'iPhone', icon: Smartphone, width: 393, height: 852, radius: 48, notch: true },
  { id: 'iphone15', label: 'iPhone 15', brand: 'iPhone', icon: Smartphone, width: 390, height: 844, radius: 48, notch: true },
  { id: 'iphone14', label: 'iPhone 14', brand: 'iPhone', icon: Smartphone, width: 390, height: 844, radius: 48, notch: true },
  { id: 'iphoneSE', label: 'iPhone SE', brand: 'iPhone', icon: Smartphone, width: 375, height: 667, radius: 12, notch: false },

  // Samsung Galaxy
  { id: 'galaxyS24ultra', label: 'Galaxy S24 Ultra', brand: 'Samsung', icon: Smartphone, width: 412, height: 915, radius: 28, notch: false },
  { id: 'galaxyS24', label: 'Galaxy S24', brand: 'Samsung', icon: Smartphone, width: 384, height: 854, radius: 28, notch: false },
  { id: 'galaxyS23', label: 'Galaxy S23', brand: 'Samsung', icon: Smartphone, width: 360, height: 780, radius: 28, notch: false },
  { id: 'galaxyZFold', label: 'Galaxy Z Fold5', brand: 'Samsung', icon: Smartphone, width: 344, height: 882, radius: 20, notch: false },

  // Google Pixel
  { id: 'pixel8pro', label: 'Pixel 8 Pro', brand: 'Pixel', icon: Smartphone, width: 448, height: 998, radius: 32, notch: false },
  { id: 'pixel8', label: 'Pixel 8', brand: 'Pixel', icon: Smartphone, width: 412, height: 915, radius: 36, notch: false },
  { id: 'pixel7', label: 'Pixel 7', brand: 'Pixel', icon: Smartphone, width: 412, height: 915, radius: 36, notch: false },

  // Other Android (Xiaomi / OnePlus)
  { id: 'xiaomi14', label: 'Xiaomi 14', brand: 'Other Android', icon: Smartphone, width: 393, height: 873, radius: 30, notch: false },
  { id: 'oneplus12', label: 'OnePlus 12', brand: 'Other Android', icon: Smartphone, width: 420, height: 933, radius: 30, notch: false },

  // Tablets
  { id: 'ipadPro13', label: 'iPad Pro 13"', brand: 'Tablet', icon: Tablet, width: 1024, height: 1366, radius: 20, notch: false },
  { id: 'ipadAir', label: 'iPad Air', brand: 'Tablet', icon: Tablet, width: 820, height: 1180, radius: 20, notch: false },
  { id: 'galaxyTabS9', label: 'Galaxy Tab S9', brand: 'Tablet', icon: Tablet, width: 800, height: 1280, radius: 16, notch: false },

  // Desktop / Laptop
  { id: 'macbookPro', label: 'MacBook Pro 14"', brand: 'Desktop', icon: Monitor, width: 1512, height: 982, radius: 0, notch: false },
  { id: 'desktop', label: 'Desktop 1440p', brand: 'Desktop', icon: Monitor, width: 1440, height: 900, radius: 0, notch: false },
] as const

type Props = {
  html: string
  title: string
  onClose: () => void
  /** Initial device id; defaults to 'iphone15pro' */
  initialDeviceId?: string
}

// Group presets in display order, preserving the brand order from DEVICE_PRESETS.
function groupByBrand(presets: readonly DevicePreset[]) {
  const groups: { brand: string; devices: DevicePreset[] }[] = []
  for (const d of presets) {
    let g = groups.find((x) => x.brand === d.brand)
    if (!g) {
      g = { brand: d.brand, devices: [] }
      groups.push(g)
    }
    g.devices.push(d)
  }
  return groups
}

export default function DevicePreviewModal({ html, title, onClose, initialDeviceId = 'iphone15pro' }: Props) {
  const [deviceId, setDeviceId] = useState<string>(initialDeviceId)
  const device = DEVICE_PRESETS.find(d => d.id === deviceId) || DEVICE_PRESETS[0]
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const htmlLen = html?.length ?? 0

  // Stage (right panel) measured size for accurate scale
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<{ w: number; h: number }>({ w: 800, h: 700 })

  // Recompute stage dimensions on mount + resize.
  // Use ResizeObserver instead of just window.resize so we react when the
  // sidebar finishes laying out (which changes stage width on first paint).
  useLayoutEffect(() => {
    if (!stageRef.current) return
    const el = stageRef.current
    const update = () => {
      const r = el.getBoundingClientRect()
      setStage({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  // Build a blob URL from the HTML each time `html` changes.
  useEffect(() => {
    if (!html) {
      setBlobUrl(null)
      setIframeLoaded(false)
      return
    }
    setIframeLoaded(false)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [html])

  // NOTE: We deliberately do NOT reset iframeLoaded on deviceId change.
  // The iframe is keyed on blobUrl (not deviceId), so it does NOT remount
  // when the user picks a different device — its width/height props just
  // change. If we reset iframeLoaded, onLoad never fires again and the
  // overlay sits forever. Keeping the loaded state across device switches
  // is correct: the HTML is already rendered, only the viewport changed.

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Scale to fit the right-side stage, leaving margin for the device bezel.
  // The frame wrapper is (device.width + 24) × (device.height + 24), so
  // reserve 48px margin around it inside the stage.
  const framedW = device.width + 24
  const framedH = device.height + 24
  const scale = Math.min(
    (stage.w - 48) / framedW,
    (stage.h - 48) / framedH,
    1, // never upscale past native
  )
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 0.5

  const groups = groupByBrand(DEVICE_PRESETS)

  return (
    <div
      data-testid="device-preview-modal"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'var(--overlay)', backdropFilter: 'blur(8px)',
        display: 'flex', flexDirection: 'column',
        fontFamily: '-apple-system, "SF Pro Display", Arial, sans-serif',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Top toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '14px 24px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <Eye size={16} color="var(--brand)" />
          <span style={{ color: 'var(--text-1)', fontSize: 14, fontWeight: 600 }}>
            Landing Page Preview
          </span>
          <span style={{
            color: 'var(--text-3)', fontSize: 12,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ color: 'var(--text-3)', fontSize: 11, fontFamily: 'SF Mono, monospace' }}>
            {htmlLen.toLocaleString()} bytes
          </span>
          <button
            onClick={onClose}
            aria-label="Close preview"
            style={{
              background: 'var(--surface-3)', border: 'none', borderRadius: '50%',
              width: 32, height: 32, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={16} color="var(--text-2)" />
          </button>
        </div>
      </div>

      {/* Body: left device list + right stage */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* ── LEFT: device list ─────────────────────────── */}
        <aside style={{
          width: 240, flexShrink: 0,
          borderRight: '1px solid var(--border)',
          overflowY: 'auto', padding: '16px 0',
        }}>
          {groups.map((g) => (
            <div key={g.brand} style={{ marginBottom: 16 }}>
              <div style={{
                padding: '6px 20px',
                fontSize: 10, fontWeight: 700,
                letterSpacing: 1.5, textTransform: 'uppercase',
                color: 'var(--text-3)',
              }}>
                {g.brand}
              </div>
              {g.devices.map((d) => {
                const Icon = d.icon
                const isActive = d.id === deviceId
                return (
                  <button
                    key={d.id}
                    onClick={() => setDeviceId(d.id)}
                    data-device={d.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', padding: '8px 20px',
                      background: isActive ? 'var(--brand-light)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                      border: 'none', borderRightWidth: 0, borderTopWidth: 0, borderBottomWidth: 0,
                      color: isActive ? 'var(--text-1)' : 'var(--text-2)',
                      fontSize: 13, fontWeight: isActive ? 600 : 400,
                      textAlign: 'left', cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)'
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.label}
                      </div>
                      <div style={{
                        fontSize: 10, color: 'var(--text-3)',
                        fontFamily: 'SF Mono, monospace', marginTop: 1,
                      }}>
                        {d.width}×{d.height}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ))}
        </aside>

        {/* ── RIGHT: device stage ───────────────────────── */}
        <div
          ref={stageRef}
          style={{
            flex: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', position: 'relative',
          }}
        >
          <div style={{
            width: framedW,
            height: framedH,
            transform: `scale(${safeScale})`,
            transformOrigin: 'center center',
            position: 'relative',
          }}>
            {/* Device bezel */}
            <div style={{
              position: 'absolute', inset: 0,
              border: device.brand === 'Desktop' ? '2px solid var(--border-strong)' : '3px solid var(--border-strong)',
              borderRadius: device.radius + 6,
              background: device.brand === 'Desktop' ? 'var(--surface-3)' : 'var(--surface-2)',
              boxShadow: 'var(--shadow-lg), inset 0 0 0 1px var(--surface-3)',
            }} />

            {/* Dynamic island / notch indicator */}
            {device.notch && (
              <div style={{
                position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                width: 120, height: 32, borderRadius: 20,
                background: 'var(--bg)', zIndex: 2,
              }} />
            )}

            {/* Iframe container */}
            <div style={{
              position: 'absolute',
              top: 12, left: 12, right: 12, bottom: 12,
              borderRadius: Math.max(0, device.radius - 4),
              overflow: 'hidden',
              background: '#fff',
            }}>
              {blobUrl ? (
                <>
                  <iframe
                    key={blobUrl /* force remount on URL change */}
                    src={blobUrl}
                    title={`Preview - ${title}`}
                    data-testid="preview-iframe"
                    onLoad={() => setIframeLoaded(true)}
                    scrolling="yes"
                    style={{
                      border: 'none',
                      width: device.width,
                      height: device.height,
                      display: 'block',
                      background: '#fff',
                    }}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                  {/* Overlay shown until iframe finishes loading. Prevents the
                      phantom black screen if the landing hero is dark. */}
                  {!iframeLoaded && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: '#fff', color: '#666', fontSize: 13, gap: 6,
                    }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%',
                        border: '2px solid #e5e5e7', borderTopColor: 'var(--brand)',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                      <span>Rendering…</span>
                      <span style={{ fontSize: 10, color: '#999' }}>
                        {htmlLen.toLocaleString()} bytes
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 14 }}>
                  {html ? 'Preparing preview…' : 'No HTML to preview'}
                </div>
              )}
            </div>
          </div>

          {/* Stage footer info */}
          <div style={{
            position: 'absolute', bottom: 16, left: 0, right: 0,
            textAlign: 'center',
            color: 'var(--text-3)', fontSize: 11,
            pointerEvents: 'none',
          }}>
            {device.label} · {device.width} × {device.height}px · {Math.round(safeScale * 100)}% · Esc to close
          </div>
        </div>
      </div>
    </div>
  )
}
