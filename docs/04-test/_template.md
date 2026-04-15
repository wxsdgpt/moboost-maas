# 测试模板：<模块名>

## 测试矩阵

| 用例编号 | 类型 | 描述 | 预期 | 状态 |
|----------|------|------|------|------|
| T1 | 单元 | … | … | ⬜ |
| T2 | 集成 | … | … | ⬜ |
| T3 | E2E | … | … | ⬜ |

## 测试入口

- 视觉测试页：`http://localhost:3000/test/<module>`
- 单元测试：`npm test src/lib/<module>*.test.ts`
- E2E：`npx playwright test src/e2e/<module>*.spec.ts`

## fixture

| 文件 | 用途 |
|------|------|
| `src/lib/testFixtures/<sample>.ts` | … |

## 已修复 bug 的回归用例

| Bug | 复现条件 | 用例 |
|-----|---------|------|
| | | |

## 待补测试

- [ ] …
