# 高内聚 · 低耦合原则

## 一句话总纲

**一个模块内的文件经常一起改，不同模块的文件几乎从不一起改。**

## 高内聚（Cohesion）

> 一个模块对外负责一件事，与该事相关的所有代码都在模块目录内。

### 落地做法

1. **按模块分目录，不按技术层分目录**
   - ✅ `src/app/landing/`、`src/lib/landingGenerator.ts`、`src/app/api/landing/`、`src/app/test/preview/`
   - ❌ `src/hooks/`、`src/utils/`、`src/types/`（所有模块共用的大杂烩目录）

2. **模块内部允许任意结构**，只要对外只暴露一个入口文件
   - Landing 对外只暴露 `landingGenerator.generate(brief)` 和 `<DevicePreviewModal />`
   - 模块内部怎么拆 helper 是模块的自由

3. **domain 类型与模块同目录**
   - `landingTypes.ts`、`reportTypes.ts`、`briefTypes.ts` 紧挨对应 generator

## 低耦合（Coupling）

> 模块与模块之间只通过「稳定的契约」协作，不共享实现细节。

### 允许的协作方式

| 场景 | 推荐方式 |
|------|---------|
| A 模块需要 B 模块的数据 | 调 B 的 API（`fetch('/api/b/...')`） |
| A 模块需要 B 模块的类型 | 从 B 的 `*Types.ts` import 类型（仅类型） |
| A 模块需要 B 模块的 UI 片段 | 把 B 的组件放进 `src/components/` 共享层 |
| 两者都需要同一基础设施 | 都依赖 `src/lib/<shared>.ts` |

### 禁止的耦合

- ❌ 跨模块直接 import 实现函数（如 Report import `landingGenerator`）
- ❌ 两个业务模块共享一个 store / 全局状态
- ❌ 在 Presentation 层直接 import `openrouter.ts` 绕过 API

## 接口契约（Contract）

模块与外界（其他模块 / 前端）的交互必须声明契约。契约写在 `src/lib/<module>Types.ts`：

```ts
// src/lib/landingTypes.ts
export type LandingBrief = { /* ... */ }
export type LandingPage = { html: string; metadata: LandingMeta }

// API 的 request/response 也用同一套类型
export type GenerateLandingRequest = { brief: LandingBrief }
export type GenerateLandingResponse = LandingPage
```

API 路由 + 前端 fetch + domain generator 三端共用这套类型 → 改一处 TS 会在其他地方报错，形成天然的约束。

## 防腐 checklist

PR 提交前自检：

- [ ] 我改的文件是否都在同一个模块目录下？若跨模块，是否只改了 `*Types.ts` 或 `components/`？
- [ ] 我是否新增了「全能 util 文件」？（如果是，应该放到具体模块里）
- [ ] 我是否在 Presentation 层 import 了 `openrouter.ts` / `db.ts`？（应走 API）
- [ ] 我新增的 API 有没有在 `*Types.ts` 里登记 request/response 类型？
- [ ] 相关的 `01-prd` / `02-ui` / `03-dev` / `04-test` 文档是否同步更新？

## 反例与改造

### 反例 1：跨模块直连

```ts
// ❌ /src/app/report/page.tsx
import { generateLanding } from '@/lib/landingGenerator'
```

改造：

```ts
// ✅
await fetch('/api/landing/generate', { method: 'POST', body: JSON.stringify(brief) })
```

### 反例 2：共享大杂烩

```
src/utils/helpers.ts  ← 200 行，里面有 landing/report/brief 各种逻辑
```

改造：按来源拆分到各模块的 `src/lib/<module>*.ts`。
