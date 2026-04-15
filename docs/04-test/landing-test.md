# 测试：Landing 模块

## 测试矩阵

| # | 类型 | 描述 | 预期 |
|---|------|------|------|
| T1 | 视觉 | 加载 SAMPLE_LANDING_PAGE_HTML 进 modal | iframe 渲染完整 LP |
| T2 | 视觉 | 切换设备 chip | iframe 尺寸变化 |
| T3 | 视觉 | 点击 LP 内 CTA 按钮 | 文字变成 "Thanks! ✓" |
| T4 | 视觉 | 编辑 textarea HTML | iframe 重载新内容 |
| T5 | 视觉 | 按 Esc / 点遮罩 | modal 关闭 |
| T6 | 单元 | `landingGenerator` 输出含 `<!DOCTYPE>` | true |
| T7 | 集成 | `/api/landing/generate` 返回合法 HTML | 字符串以 `<!DOCTYPE` 开头 |

## 测试入口

- 视觉：`http://localhost:3000/test/preview`
- fixture：`src/lib/testFixtures/sampleLandingPage.ts`

## 历史 bug 回归

| Bug | 复现 | 用例 |
|-----|------|------|
| iframe 空白 | 之前 `useRef` blob URL → 不触发 re-render | T1（必须立即可见） |
| CSP 拦截 srcDoc | 用 srcDoc + 严格 CSP | 改为 blob URL，已隐式覆盖 |
| 重复组件实现 | execute page 内嵌一份、components 一份 | 已抽 `DevicePreviewModal`，T1 等同时验证 |

## 待补

- [ ] Playwright snapshot：modal 三种设备截图对比
- [ ] `landingGenerator` 单元测试
