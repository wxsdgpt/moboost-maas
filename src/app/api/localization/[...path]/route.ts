/**
 * Catch-all proxy: /api/localization/[...path] → FastAPI backend
 *
 * Maps e.g. /api/localization/v1/assets → ADLOC_SERVICE_URL/v1/assets
 * Authenticates via Clerk, then forwards with a service-to-service token.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND_URL =
  process.env.ADLOC_SERVICE_URL || 'http://localhost:8000'

type RouteContext = { params: Promise<{ path: string[] }> }

async function proxy(req: NextRequest, ctx: RouteContext): Promise<NextResponse> {
  // 1. Authenticate the caller via Clerk
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 })
  }

  // 2. Build the upstream URL
  const { path } = await ctx.params
  const upstream = new URL(`/${path.join('/')}`, BACKEND_URL)
  // Forward query-string as-is
  req.nextUrl.searchParams.forEach((v, k) => upstream.searchParams.append(k, v))

  // 3. Build headers for the upstream request
  const headers = new Headers()
  headers.set('Authorization', `Bearer ${process.env.ADLOC_SERVICE_TOKEN ?? ''}`)
  headers.set('X-User-Id', userId)

  const contentType = req.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  // 4. Forward the request body (if present)
  const hasBody = !['GET', 'HEAD'].includes(req.method)
  const body = hasBody ? await req.arrayBuffer() : undefined

  // 5. Proxy the request
  let upstream_res: Response
  try {
    upstream_res = await fetch(upstream.toString(), {
      method: req.method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'upstream unreachable'
    return NextResponse.json(
      { ok: false, error: 'service_unavailable', detail: message },
      { status: 502 },
    )
  }

  // 6. Determine response type and stream back
  const resContentType = upstream_res.headers.get('content-type') ?? ''
  const isJson = resContentType.includes('application/json')

  if (isJson) {
    const data = await upstream_res.json()
    return NextResponse.json(data, { status: upstream_res.status })
  }

  // Binary / file download — stream the body through
  const resBody = await upstream_res.arrayBuffer()
  const res = new NextResponse(resBody, { status: upstream_res.status })

  // Forward relevant headers for downloads
  for (const key of ['content-type', 'content-disposition', 'content-length']) {
    const val = upstream_res.headers.get(key)
    if (val) res.headers.set(key, val)
  }

  return res
}

export const GET    = proxy
export const POST   = proxy
export const PUT    = proxy
export const PATCH  = proxy
export const DELETE = proxy
