# 测试：Admin 模块

## 测试矩阵

| # | 类型 | 描述 | 预期 |
|---|------|------|------|
| T1 | 集成 | 非 admin 访问 `/admin` | 403 |
| T2 | 集成 | admin 调 `grant` API | 余额变化 + eventLog 写入 |
| T3 | 集成 | charge 时余额不足 | 返回 429 |
| T4 | 视觉 | AdminMutationBanner 二次确认 | 必须确认才执行 |

## 安全测试

- [ ] 尝试用 cookie 伪造 admin → 应 403
- [ ] 横向越权：A admin 修改 B admin 数据 → 视权限设计是否允许
- [ ] SQL 注入：搜索框、ID 参数 → Supabase 客户端参数化已防护，仍要测

## 审计

每次发版前抽查最近 10 条 admin 操作的 eventLog 完整性。

## 待补

- [ ] 自动化权限测试套件
- [ ] 积分账本对账脚本
