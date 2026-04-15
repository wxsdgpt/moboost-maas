import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const res = NextResponse.json({ ok: true })
    res.cookies.set('moboost_session', '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return res
  } catch (err) {
    console.error('[logout]', err)
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
