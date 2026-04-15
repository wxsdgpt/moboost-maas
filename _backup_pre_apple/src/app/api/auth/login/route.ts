import { NextRequest, NextResponse } from 'next/server'

const VALID_USERNAME = 'moboost'
const VALID_PASSWORD = '20260401Jacky'
const SESSION_TOKEN   = 'moboost_session_v1'
const COOKIE_NAME     = 'moboost_session'

export async function POST(req: NextRequest) {
  const { username, password } = await req.json()

  if (username === VALID_USERNAME && password === VALID_PASSWORD) {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, SESSION_TOKEN, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
    return res
  }

  return NextResponse.json({ ok: false, error: 'Invalid credentials' }, { status: 401 })
}
