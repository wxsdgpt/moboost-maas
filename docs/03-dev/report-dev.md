# Dev：Report 模块

## 目录

```
src/app/report/[id]/page.tsx     详情页
src/app/evolution/                演化对比
src/app/api/reports/              生成/读/删
src/app/api/evolution/            演化 API
src/lib/reportGenerator.ts        主流程
src/lib/reportTypes.ts            契约
src/lib/specValidator.ts          schema 校验
src/lib/assetSpecs.ts             各 asset 的 schema
```

## 对外契约

| Method | Path | 职责 |
|--------|------|------|
| POST | `/api/reports/generate` | brief → Report |
| GET | `/api/reports/[id]` | 读取报告 |
| POST | `/api/evolution/start` | 基于现有 report 演化 v2 |

## 关键流程

```
BriefBundle
  → reportGenerator.compose() (LLM)
  → specValidator.validate(report, assetSpecs)
      ├─ valid → 落库 + 返回
      └─ invalid → retry 一次 → 仍失败降级 schema
```

## Spec 校验

所有 Report 字段必须匹配 `assetSpecs.ts` 定义的 schema。UI 通过 `SpecValidationBadge` 展示校验结果。

## 演化（Evolution）

`evolutionEngine` 接收 `{ reportId, newConstraints }`，在 LLM prompt 里注入 diff 指令，生成 v2 并持久化为新版本。旧版本不删。

## 性能

- Report JSON < 50KB
- 前端分 Tab 渲染，不整段 SSR
