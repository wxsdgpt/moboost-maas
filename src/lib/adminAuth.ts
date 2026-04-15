/**
 * Admin Authentication — Simple username/password auth
 * =====================================================
 *
 * NOT Clerk-based. Admin uses a separate auth system:
 *   - Username: admin
 *   - Password: moboost0401jacky
 *   - Session: HTTP-only cookie (moboost-admin-token)
 *
 * This is intentionally simple — admin is a single developer/ops account,
 * not a user-facing feature. No need for full auth infrastructure.
 */

import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'

// ─── Credentials ──────────────────────────────────────────────────────

const ADMIN_USERNAME = 'admin'
const ADMIN_PASSWORD = 'moboost0401jacky'
const COOKIE_NAME = 'moboost-admin-token'
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'moboost-admin-secret-2026'
const TOKEN_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

// ─── Token Generation ─────────────────────────────────────────────────

function generateToken(): string {
  const payload = `${ADMIN_USERNAME}:${Date.now()}:${randomBytes(16).toString('hex')}`
  const hash = createHash('sha256').update(`${payload}:${TOKEN_SECRET}`).digest('hex')
  // Token = base64(payload:hash)
  return Buffer.from(`${payload}:${hash}`).toString('base64')
}

function validateToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length < 4) return false

    const hash = parts.pop()!
    const payload = parts.join(':')
    const expectedHash = createHash('sha256').update(`${payload}:${TOKEN_SECRET}`).digest('hex')

    if (hash !== expectedHash) return false

    // Check expiry (timestamp is second part)
    const timestamp = parseInt(parts[1], 10)
    if (isNaN(timestamp)) return false
    if (Date.now() - timestamp > TOKEN_MAX_AGE * 1000) return false

    return true
  } catch {
    return false
  }
}

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Verify admin login credentials.
 * Returns a session token on success, null on failure.
 */
export function adminLogin(username: string, password: string): string | null {
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return generateToken()
  }
  return null
}

/**
 * Check if the current request has a valid admin session.
 * Use in Server Components and API routes.
 */
export async function isAdminAuthenticated(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(COOKIE_NAME)?.value
    if (!token) return false
    return validateToken(token)
  } catch {
    return false
  }
}

/**
 * Check admin auth from a raw cookie header string (for middleware).
 */
export function isAdminTokenValid(cookieHeader: string): boolean {
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  if (!match) return false
  return validateToken(match[1])
}

export { COOKIE_NAME, TOKEN_MAX_AGE }
