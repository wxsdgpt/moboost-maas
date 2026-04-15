# API 规范

## 路由组织

所有 API 在 `src/app/api/<module>/<action>/route.ts`。按**业务模块**而非 HTTP 方法分目录。

## 鉴权模式（Clerk v6）

**中间件层**：`src/middleware.ts` 把所有 `/api/*` 设为 public，**不在中间件里拦截 API**。
**路由层**：每个 handler 自己调 `auth()` 检查：

```ts
import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }
  // ...
}
```

原因：中间件里的 JWT 时序会有 race condition → 误判 401。Clerk v6 官方推荐此模式。

## Request / Response 契约

每个 API 必须在 `src/lib/<module>Types.ts` 声明类型，**前端 fetch 和后端 handler 共用**：

```ts
// src/lib/landingTypes.ts
export type GenerateLandingRequest = { briefId: string; variant?: string }
export type GenerateLandingResponse = { html: string; metadata: LandingMeta }
```

```ts
// src/app/api/landing/generate/route.ts
import type { GenerateLandingRequest, GenerateLandingResponse } from '@/lib/landingTypes'

export async function POST(req: NextRequest) {
  const body = (await req.json()) as GenerateLandingRequest
  // ...
  const resp: GenerateLandingResponse = { html, metadata }
  return NextResponse.json(resp)
}
```

## 错误响应统一格式

```ts
// 成功
{ /* domain fields */ }

// 失败
{ error: 'unauthenticated' | 'invalid_input' | 'upstream_error' | string,
  message?: string }
```

HTTP 状态码：
- 200：成功
- 400：请求体错误
- 401：未登录
- 403：权限不足
- 429：超限（积分/限流）
- 502：上游（OpenRouter / Supabase）异常
- 500：未捕获

## 上游调用防御

1. **统一超时**：`fetchWithTimeout(url, opts, 300_000)`（见 `generate-video/route.ts`）
2. **safeParseJson**：上游可能返回 HTML 错误页，不能裸调 `.json()`
3. **日志**：成功/失败都 `console.log('[module] ...')`，便于 Vercel logs 追踪
4. **重试**：幂等调用（如 LLM generation）可重试 2 次；非幂等（如扣点）绝不重试

## 积分扣点

写操作前调 `creditLedger.charge(userId, amount, reason)`，失败时直接返回 429。

## 示例：完整 handler 骨架

```ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { generateLanding } from '@/lib/landingGenerator'
import { charge } from '@/lib/creditLedger'
import type { GenerateLandingRequest, GenerateLandingResponse } from '@/lib/landingTypes'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  let body: GenerateLandingRequest
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

  if (!body.briefId) return NextResponse.json({ error: 'briefId required' }, { status: 400 })

  const charged = await charge(userId, 10, 'landing-generate')
  if (!charged.ok) return NextResponse.json({ error: 'insufficient_credits' }, { status: 429 })

  try {
    const result: GenerateLandingResponse = await generateLanding(body)
    return NextResponse.json(result)
  } catch (e) {
    console.error('[landing/generate]', e)
    return NextResponse.json({ error: 'upstream_error', message: String(e) }, { status: 502 })
  }
}
```
