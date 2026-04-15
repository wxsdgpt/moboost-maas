# 编码规范

## 语言 & 版本

- TypeScript `strict: true`（`tsconfig.json`）
- Node ≥ 18（Vercel runtime）
- React 18 + Next.js 14 App Router

## TypeScript

- 禁用 `any`，必须时写 `unknown` + 类型守卫。
- 所有公共函数显式声明参数 / 返回类型。
- 对外 API 的 request/response 类型放在 `<module>Types.ts`。

```ts
// ✅
export async function generateLanding(req: GenerateLandingRequest): Promise<GenerateLandingResponse> { ... }

// ❌
export async function generateLanding(req: any) { ... }
```

## React

- 只用函数组件 + Hooks。
- 顶级 `'use client'` 仅在需要 `useState/useEffect` 的文件里。
- **不要**在渲染函数里做副作用。
- **不要**在组件内直接 fetch domain layer（只能走 `/api/*`）。

## Hook 规则

- 状态需要触发 re-render → `useState`；**不要用 useRef**（如 `DevicePreviewModal` 的 blob URL 教训）。
- 清理副作用必须用 useEffect return：`return () => URL.revokeObjectURL(url)`。

## 样式

- 内联 style 或 CSS Modules（本项目当前用内联）。
- 颜色/字号**必须**引用 design tokens。
- `className` 简洁；避免写 Tailwind-like 长类串。

## 命名

| 对象 | 规则 |
|------|------|
| 常量 | `UPPER_SNAKE` |
| 函数 / 变量 | `camelCase` |
| 类型 / 接口 / 组件 | `PascalCase` |
| 文件 | 与主要导出一致 |

## 注释

- 复杂逻辑顶部写 1–3 行"为什么"（不是"做什么"）
- 重要决策用 `// NOTE:` 标注，陷阱用 `// WARNING:`

## 日志

- `console.log('[<module>] event:', data)` — 每个 API 关键路径
- 错误：`console.error('[<module>] error:', err)`
- 不要 log 敏感信息（API key、用户邮箱明文）

## 异步

- 一律 async/await，不写 `.then`。
- 所有外部 fetch 必须包一层 timeout。
- 并发用 `Promise.all`，严禁顺序 await 可并发的请求。

## Git 提交

- Conventional commits：`feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`, `test: ...`
- 单个 commit 只做一件事
- PR 描述必须列出：PRD/UI/Dev/Test 四层是否同步更新

## 代码审查 checklist

见 [CONTRIBUTING.md](../CONTRIBUTING.md)
