# 模块地图

## 模块清单

| 模块 | 页面路由 | API 路由 | 核心 lib | 共享组件 | 测试页 |
|------|---------|----------|---------|---------|--------|
| **Brief** | `/brief/execute` | `/api/brief/*` | `briefFetcher`, `intentDetector`, `expertSearchStore` | `UnifiedCollector`, `ThinkingPanel` | — |
| **Report** | `/report`, `/evolution` | `/api/reports/*`, `/api/evolution/*` | `reportGenerator`, `reportTypes` | `ModelRouter`, `SpecValidationBadge` | — |
| **Landing** | `/landing` | `/api/landing/*` | `landingGenerator`, `landingTemplates` | `DevicePreviewModal` | `/test/preview` |
| **Video** | （嵌在 Report） | `/api/generate-video` | — | — | `/test/video` |
| **Admin** | `/admin/*` | `/api/admin/*` | `adminAuth`, `creditLedger`, `eventLog` | `AdminSidebar`, `AdminMutationBanner` | — |

## 跨模块共享

| 类型 | 文件 | 说明 |
|------|------|------|
| 鉴权 | `src/lib/auth.ts`, `src/middleware.ts` | Clerk 封装 |
| 数据库 | `src/lib/db.ts`, `src/lib/projectPersistence.ts` | Supabase 客户端 + 项目 CRUD |
| LLM | `src/lib/callLLM.ts`, `src/lib/openrouter.ts` | 统一 LLM 调用入口 |
| 存储 | `src/lib/storage.ts` | Supabase Storage 封装 |
| 积分 | `src/lib/creditLedger.ts` | 计费扣点 |
| 日志 | `src/lib/eventLog.ts` | 审计日志 |
| 主题 | `src/components/ThemeProvider.tsx`, `themeStore.ts` | 明/暗主题 |

## 依赖关系（允许方向）

```
Admin   Brief   Report   Landing   Video
  │       │       │        │         │
  └───┬───┴───┬───┴────┬───┴────┬────┘
      ▼       ▼        ▼        ▼
      Shared（auth / db / callLLM / storage / creditLedger）
      │
      ▼
      External（Clerk / Supabase / OpenRouter / VEO）
```

**硬约束**：

- ✅ 业务模块 → Shared：允许
- ✅ Shared → External：允许（仅通过 Infrastructure 适配器）
- ❌ 业务模块 → 业务模块：**禁止直接 import**。若需协作，通过 API 调用或共享 domain 类型。
- ❌ Shared → 业务模块：**禁止反向依赖**。
- ❌ Presentation → Domain/Infrastructure：禁止跨层直连。

## 新增模块的落地步骤

1. 在 `src/app/<module>/` 下建页面
2. 在 `src/app/api/<module>/` 下建 API 路由
3. 在 `src/lib/` 下建 `<module>Generator.ts` 或 `<module>Store.ts`（domain 层）
4. 在 `src/app/test/<module>/page.tsx` 下建视觉测试页
5. 在 `docs/01-prd` ~ `docs/04-test` 各补一份模块文档
