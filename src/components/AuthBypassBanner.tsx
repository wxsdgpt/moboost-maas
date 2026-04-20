/**
 * AuthBypassBanner — v1.0.2 visible warning when AUTH_BYPASS is on.
 *
 * Renders a red strip FIXED at the top of the viewport so it does NOT consume
 * any layout space. (Sticky positioning inside <body> pushed the chrome down
 * by 28px, which collided with Sidebar's `position: fixed top:0` and
 * MainContent's fixed margin-left — that caused the v1.0.2 layout break.)
 *
 * The banner is `pointer-events: none` so it never intercepts clicks on the
 * logo / theme toggle sitting behind its edge.
 */

import { AUTH_BYPASS } from '@/lib/authBypass'

export const AUTH_BYPASS_BANNER_HEIGHT = 28

export default function AuthBypassBanner() {
  if (!AUTH_BYPASS) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: AUTH_BYPASS_BANNER_HEIGHT,
        zIndex: 100000,
        background: '#b91c1c',
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: 0.3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px',
        fontFamily: '-apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
        pointerEvents: 'none',
      }}
    >
      ⚠️ AUTH BYPASS ENABLED — all auth checks are disabled. v1.0.2 test build. Do not ship.
    </div>
  )
}
