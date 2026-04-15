# 测试策略

## 测试金字塔

```
        ▲   E2E（少量，关键 happy path）
       ╱ ╲      Playwright（已安装），跑 Brief→Report→Landing 的端到端
      ╱   ╲
     ╱─────╲    集成 / 视觉测试（中量）
    ╱       ╲      /test/<module> 路由：手动 + 视觉确认
   ╱─────────╲
  ╱           ╲   单元（多量）
 ╱             ╲     纯函数：specValidator, sourceQuality, intentDetector
╱───────────────╲    （后续接 Vitest）
```

## 各层手段

| 层 | 工具 | 当前状态 |
|----|------|----------|
| 单元 | Vitest（待引入） | 现仅 `src/lib/__tests__/` 占位 |
| 集成 | `/test/<module>` 路由 | ✅ Landing / Video 已有 |
| 视觉 | 手动 + 截图 | 接入 Playwright snapshot（待） |
| E2E | Playwright | 已安装，待写脚本 |
| 静态分析 | `moboost-test` skill 的 228 项扫描 | ✅ 已可用 |

## 测试覆盖优先级

1. **业务关键路径**（Brief→Report→Landing→Video）
2. **跨模块契约**（API request/response 类型一致性）
3. **历史事故**（每个修过的 bug 都要补一个测试用例，防回归）
4. **边界**：空输入、超长、特殊字符、网络失败

## /test/<module> 视觉测试规范

每个模块在 `src/app/test/<module>/page.tsx` 提供测试页：

- 用 fixture（`src/lib/testFixtures/`）模拟真实数据，**不依赖**生产 LLM 调用
- 提供"Expected behaviour" checklist 让审核者勾选
- 提供"端到端"按钮做真实链路抽测（按需）

测试路由通过 `src/middleware.ts` 设为 public，本地与预发可直访。**生产环境**应在部署前从 `middleware` 移除或加 admin gate。

## 单元测试落地（待执行）

```
npm i -D vitest @testing-library/react jsdom
```

约定：测试与源码同目录 + `.test.ts`：

```
src/lib/specValidator.ts
src/lib/specValidator.test.ts
```

## E2E 落地（待执行）

```
src/e2e/
├── brief-to-landing.spec.ts
└── video-end-to-end.spec.ts
```

`playwright.config.ts` 已存在，可直接 `npx playwright test`。

## 回归测试 checklist

每次发版前跑：

- [ ] `moboost-test` skill 全 228 项 ≥ 95% 通过
- [ ] `/test/preview` 手动跑：HTML 渲染 / 设备切换 / 脚本执行
- [ ] `/test/video` 手动跑：Big Buck Bunny 播放有声 + VEO 端到端
- [ ] 关键页面（首页 / brief / report）截图对比

## bug 修复流程（强制）

1. 复现 bug，写**最小** fixture
2. 把 fixture 加进对应 `/test/<module>` 测试页
3. 确认测试页能复现 bug（红）
4. 修代码，确认测试页通过（绿）
5. 在 `04-test/<module>-test.md` 记录这条用例
