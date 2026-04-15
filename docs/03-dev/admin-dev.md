# Dev：Admin 模块

## 目录

```
src/app/admin/                  页面（用户/积分/事件）
src/app/api/admin/              API
src/lib/adminAuth.ts            鉴权封装
src/lib/creditLedger.ts         积分账本
src/lib/eventLog.ts             事件日志
src/components/AdminSidebar.tsx
src/components/AdminMutationBanner.tsx
```

## 鉴权

双层校验：

1. **中间件**（`src/middleware.ts`）：admin 路由是 public（让 handler 自查），但页面仍走 Clerk 登录
2. **路由内**：`adminAuth.assertAdmin(userId)` 检查角色，否则 403

```ts
const { userId } = await auth()
if (!userId) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
const isAdmin = await adminAuth.isAdmin(userId)
if (!isAdmin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
```

## 积分账本

`creditLedger.ts` 暴露：
- `balance(userId)` → number
- `charge(userId, amount, reason)` → `{ ok, balance }`
- `grant(userId, amount, reason, adminId)` → 必须传 adminId

所有写操作记 eventLog。

## 事件日志

每次 mutation 都调 `eventLog.write({ userId, type, payload, actorId })`，落 Supabase 表。

## UI：危险操作

写操作页面强制使用 `AdminMutationBanner`，二次确认后再发请求。

## 测试

由于涉及计费，admin 写操作必须有手动验收记录，见 `04-test/admin-test.md`。
