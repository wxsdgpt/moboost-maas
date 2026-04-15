# Dev：Video 模块

## 目录

```
src/app/api/generate-video/route.ts   唯一 API
src/app/test/video/page.tsx           测试页
```

Video 模块刻意保持薄：domain 逻辑全在 `route.ts`，因为只是对 OpenRouter VEO API 的封装。

## 对外契约

`POST /api/generate-video`，body：

```ts
// submit
{ action: 'submit', prompt: string }
// → { jobId, status: 'submitted', raw }

// poll
{ action: 'poll', jobId: string }
// → { jobId, status, progress, raw }

// download
{ action: 'download', jobId: string }
// → { jobId, status: 'completed', videoUrl?: string, videoData?: string /* base64 data URL */ }
```

## OpenRouter 调用

- Endpoint：`https://openrouter.ai/api/v1/videos`
- Model：`google/veo-3.1`（可通过 `VIDEO_MODEL` 覆盖）
- 音频：`generate_audio: true`（顶层字段，非 `parameters` 子对象）

## 防御要点

### 1. safeParseJson

OpenRouter 在限流 / 维护时返回 HTML 错误页。直接 `.json()` 会抛 `Unexpected token '<'`。
本模块用 `safeParseJson(response, label)` 检测 HTML 响应并返回友好错误。

### 2. fetchWithTimeout

所有上游请求 300s 超时，避免 Vercel function 卡死。

### 3. CSP

`next.config.js` 必须包含 `media-src 'self' data: blob: https:`，否则视频被拦截。

### 4. <video> 属性

前端 `<video>` 必须**不带 `muted`、不带 `autoPlay`**：
```tsx
<video src={...} controls loop playsInline preload="metadata" />
```

## 环境变量

| 变量 | 必填 | 默认 |
|------|------|------|
| `OPENROUTER_API_KEY` | ✅ | — |
| `OPENROUTER_BASE_URL` | ❌ | `https://openrouter.ai/api/v1` |
| `VIDEO_MODEL` | ❌ | `google/veo-3.1` |
| `VIDEO_GENERATE_AUDIO` | ❌ | `true` |

## 已知陷阱

| 陷阱 | 表现 | 修复 |
|------|------|------|
| `muted` 属性 | 用户说"没声音" | 移除 |
| 缺 `media-src` | 视频不加载 | 补 CSP |
| `parameters.generateAudio` | 部分 model 不识别 | 改为顶层 `generate_audio` |
| OpenRouter HTML 错误 | "Unexpected token '<'" | safeParseJson |
