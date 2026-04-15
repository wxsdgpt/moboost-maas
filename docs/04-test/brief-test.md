# 测试：Brief 模块

## 测试矩阵

| # | 类型 | 描述 | 预期 |
|---|------|------|------|
| T1 | 单元 | `intentDetector.detect` 输入合法句子 | 返回完整 Intent |
| T2 | 单元 | 输入空字符串 | 抛 InvalidInput |
| T3 | 单元 | `sourceQuality.score` 评分函数 | 已知好/坏域名输出 > 0.8 / < 0.3 |
| T4 | 集成 | `/api/brief/execute` happy path | 60s 内返回 BriefBundle |
| T5 | 集成 | LLM 失败一次 | 自动重试一次后成功 |
| T6 | 集成 | 搜索服务 down | 返回 `degraded: true` 而非 500 |
| T7 | E2E | 用户从首页输入 → 看到 Brief 卡片 | 全程无错 |

## 测试入口

- 单元（待）：`npm test src/lib/intentDetector.test.ts`
- 视觉：当前无独立 /test/brief，可在 `/brief/execute` 用 mock prompt 验

## 待补

- [ ] 单元测试基础设施（Vitest）
- [ ] 建 `/test/brief` 测试页 + 多 prompt fixture
