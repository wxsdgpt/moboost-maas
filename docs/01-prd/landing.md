# PRD：Landing 模块（落地页生成）

## 1. 模块定位

把 Report 的"视觉方向 + 核心卖点"转为**可预览的 HTML 落地页**，用户可在 iPhone / iPad / Desktop 三种设备框中预览。

**所属业务链路**：Report → **Landing** → 预览 / 下载 / 对外发布

## 2. 目标用户 & 场景

| 角色 | 场景 | JTBD |
|------|------|------|
| 运营 | 老板要看草图 | 10 分钟出图，代替设计师初稿 |
| 设计 | 批量试不同风格 | 基于模板快速变体 |

## 3. 用户故事

- 作为运营，我想输入 brief，得到一份自包含 HTML（含 style/script）的落地页。
- 作为运营，我想在设备框内预览，切换 iPhone / iPad / Desktop 尺寸。
- 作为运营，我想点击 CTA 验证交互脚本可执行。
- 作为运营，我想编辑 HTML 文本后重载预览。

## 4. 功能需求

### 4.1 必备
- F1. `/api/landing/generate`：输入 brief，输出 HTML 字符串。
- F2. HTML 自包含：无外部 CSS / JS 依赖（允许 CDN 字体 + https 图片）。
- F3. `DevicePreviewModal` 通过 **blob URL** 加载 HTML，**不走 srcDoc**（规避 CSP 继承问题）。
- F4. iframe `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`。
- F5. 设备切换立即生效（device switcher）。
- F6. `Esc` / 点击遮罩关闭预览。

### 4.2 增强
- E1. HTML 在线编辑（已在 /test/preview 实现，待接入正式流）。
- E2. 多模板（iGaming / 电商 / SaaS 等）。
- E3. 一键发布到 Vercel。

### 4.3 非目标
- NG1. 不做多页站点（单页 LP）。
- NG2. 不做 CMS（内容即代码）。

## 5. 验收标准

- [ ] AC1. 生成 HTML 通过 W3C 最小校验（DOCTYPE / html / head / body）
- [ ] AC2. 在 `/test/preview` 可完整渲染、脚本可点击生效
- [ ] AC3. CSP 不拦截自身 HTML（blob URL 独立 origin）
- [ ] AC4. `useState` blob URL（而非 useRef）→ 首次渲染 iframe 不为空

## 6. 关键指标

| 指标 | 目标 |
|------|------|
| 生成耗时 P95 | < 45s |
| 预览渲染成功率 | 100% |
| 首屏 LCP（生成的 LP） | < 2.5s |

## 7. 依赖 & 约束

- 依赖：Report 视觉方向、`landingGenerator`、`landingTemplates`
- CSP：见 `next.config.js` 中 `frame-src blob:`、`media-src`、`script-src`

## 8. 风险

| 风险 | 应对 |
|------|------|
| LLM 输出 HTML 不合法 | 正则兜底 + `<!DOCTYPE>` 强制包裹 |
| iframe 被父 CSP 限制 | blob URL（独立 opaque origin） |
| 大 HTML 内存占用 | blob URL 在 useEffect cleanup 里 revoke |

## 9. 迭代日志

### v1.0
- 初版：F1–F6 全部上线

### v1.1 — 2026-04
- **Fix**：将 `DevicePreviewModal` 从 `useRef` 改为 `useState` 解决 iframe 空白。
- **Fix**：extract `DevicePreviewModal` 为共享组件，消除重复实现。
- **New**：新增 `/test/preview` 测试页 + `sampleLandingPage.ts` fixture。
