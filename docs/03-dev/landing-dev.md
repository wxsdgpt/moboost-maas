# Dev：Landing 模块

## 目录

```
src/app/landing/                       页面
src/app/api/landing/                   API
src/lib/landingGenerator.ts            主生成器
src/lib/landingTemplates.ts            静态模板
src/lib/testFixtures/sampleLandingPage.ts  测试 fixture
src/components/DevicePreviewModal.tsx  设备预览共享组件
src/app/test/preview/page.tsx          测试页
```

## 对外契约

| Method | Path | 职责 |
|--------|------|------|
| POST | `/api/landing/generate` | brief → HTML |
| GET | `/api/landing/[id]` | 读取 |

## HTML 契约

生成的 HTML 必须：
1. 包含 `<!DOCTYPE html>`、`<html>`、`<head>`（含 viewport meta）、`<body>`
2. 自包含：style / script 内联，不依赖外部 CSS
3. 允许 CDN 字体 + `https:` 图片

## DevicePreviewModal 关键实现

### blob URL（而非 srcDoc）

```ts
const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
const url = URL.createObjectURL(blob)
// 必须用 useState，不用 useRef，否则不触发 re-render
const [blobUrl, setBlobUrl] = useState<string | null>(null)
setBlobUrl(url)
```

**为什么不用 `srcDoc`**：iframe 的 srcDoc 会继承父页 CSP，而本站 CSP 严格，会拦截大部分 LP 资源。blob URL 有独立 opaque origin，绕过此问题。

### useEffect cleanup

```ts
return () => { URL.revokeObjectURL(url) }
```

### iframe sandbox

```
sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
```

### 强制重挂

```tsx
<iframe key={blobUrl} src={blobUrl} />
```

`key` 变化确保 URL 变时 iframe 重新加载。

## CSP 要求

`next.config.js`：
```
frame-src 'self' blob: data: ...;
media-src 'self' data: blob: https:;
```

## 错误场景

- LLM 返回的 HTML 无 `<!DOCTYPE>` → 前置正则检测，失败要求重新生成
- 字体 CDN 超时 → LP 本身降级为系统字体（`font-family` 已带 fallback）
