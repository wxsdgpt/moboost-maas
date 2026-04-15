# Dev：Brief 模块

## 目录

```
src/app/brief/execute/page.tsx     页面
src/app/api/brief/                 API：execute, intent, expert-search 等
src/lib/briefFetcher.ts            数据获取
src/lib/briefTypes.ts              类型契约
src/lib/intentDetector.ts          意图识别
src/lib/expertSearchStore.ts       专家搜索缓存
```

## 对外契约

| Method | Path | 职责 |
|--------|------|------|
| POST | `/api/brief/execute` | 执行一句话 → 返回 BriefBundle（流式可选） |
| POST | `/api/brief/intent` | 仅意图识别 |
| POST | `/api/brief/expert-search` | 专家搜索 |

类型：`src/lib/briefTypes.ts` 中的 `BriefBundle`、`BriefRequest`。

## 关键流程

```
user prompt
  → intentDetector.detect() → Intent
  → sourceSearch.search(intent) → Sources[]
  → trustedSources.filter + sourceQuality.score
  → callLLM.brief-compose(intent, sources)
  → BriefBundle
```

## 外部依赖

- `callLLM` → OpenRouter
- `sourceSearch` → 外部搜索服务
- `trustedSources`, `sourceQuality` — 内部

## 错误处理

- LLM 超时：重试一次，仍失败 502
- 搜索服务挂：降级为 LLM 无信源生成 + 标记 `degraded: true`

## 成本控制

- 单次 ≤ 30k tokens
- 专家搜索结果写入 `expertSearchStore` 1 小时 TTL 缓存
