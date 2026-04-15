/**
 * POST /api/admin/auth — Admin login
 * DELETE /api/admin/auth — Admin logout
 * GET /api/admin/auth — Check admin session
 */

import { NextRequest, NextResponse } from 'next/server'
import { adminLogin, isAdminAuthenticated, COOKIE_NAME, TOKEN_MAX_AGE } from '@/lib/adminAuth'

export const runtime = 'nodejs'

// Login
export async function POST(req: NextRequest) {
  try {
    const { username, password } = (await req.json()) as {
      username?: string
      password?: string
    }

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: '请输入用户名和密码' },
        { status: 400 },
      )
    }

    const token = adminLogin(username, password)
    if (!token) {
      return NextResponse.json(
        { ok: false, error: '用户名或密码错误' },
        { status: 401 },
      )
    }

    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: TOKEN_MAX_AGE,
    })

    return res
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}

// Check session
export async function GET() {
  const authenticated = await isAdminAuthenticated()
  return NextResponse.json({ ok: true, authenticated })
}

// Logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
