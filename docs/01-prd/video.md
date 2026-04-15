# PRD：Video 模块（VEO 3.1 视频生成）

## 1. 模块定位

基于 Report 的视频脚本，调 **Google VEO 3.1（经 OpenRouter）**生成 5–10 秒短视频，嵌入 Report 页面播放。

**所属业务链路**：Report（脚本）→ **Video** → Report 页面展示

## 2. 目标用户 & 场景

| 角色 | 场景 | JTBD |
|------|------|------|
| 运营 | 方案配套短视频 Demo | 省去外包视频制作 |
| 创意 | 快速试拍多个分镜 | 一条脚本多版本 |

## 3. 用户故事

- 作为运营，我想基于脚本一键生成视频，等待 1–3 分钟得到带音频的 mp4。
- 作为运营，我想在 report 页面直接播放，**带声音**。
- 作为运营，我想在失败时看到清晰的错误与重试按钮。

## 4. 功能需求

### 4.1 必备
- F1. `POST /api/generate-video` 三个 action：`submit` / `poll` / `download`。
- F2. 默认启用音频（`generate_audio: true`）。
- F3. 播放器：`<video controls loop playsInline preload="metadata">` — **不加 `muted`、不加 `autoplay`**（否则浏览器会强制静音）。
- F4. CSP 允许 `media-src 'self' data: blob: https:`。
- F5. OpenRouter 返回 HTML（错误页）时，`safeParseJson` 返回友好错误而非 `Unexpected token '<'`。

### 4.2 增强
- E1. 视频缓存：同 prompt 命中缓存。
- E2. 视频编辑：加水印、裁剪时长。
- E3. 生成中的进度条（依赖 VEO `progress` 字段）。

### 4.3 非目标
- NG1. 不做长视频（> 30s）。
- NG2. 不做图生视频（仅 text-to-video）。

## 5. 验收标准

- [ ] AC1. 提交 prompt → 轮询完成 → 返回 mp4 URL / base64 data URL
- [ ] AC2. 播放时**有声音**（无 `muted` 属性）
- [ ] AC3. DevTools Console 无 CSP 违规
- [ ] AC4. `/test/video` 测试页端到端通过

## 6. 关键指标

| 指标 | 目标 |
|------|------|
| 生成成功率 | ≥ 90% |
| 生成耗时 P95 | < 180s |
| 失败场景返回可读错误 | 100% |

## 7. 依赖 & 约束

- 依赖：OpenRouter 视频 API（`/api/v1/videos`）
- 环境变量：`OPENROUTER_API_KEY`, `VIDEO_MODEL`（默认 `google/veo-3.1`），`VIDEO_GENERATE_AUDIO`（默认 `true`）
- 成本：单次 ≈ $0.8–$1.5（取决于时长）

## 8. 风险

| 风险 | 应对 |
|------|------|
| OpenRouter 返回 HTML 错误页 | `safeParseJson` 捕获，返回 502 + 可读消息 |
| 浏览器静音播放（autoplay 政策） | 不加 `muted`，让用户手动点击播放 |
| CSP 拦截 mp4 | `media-src` 显式允许 https: |
| 作业超时 | 轮询最多 ~10 分钟，超时报错 |

## 9. 迭代日志

### v1.0
- 初版：submit / poll / download 完整链路

### v1.1 — 2026-04
- **Fix**：移除 `<video>` 的 `muted` 属性 → 有声音
- **Fix**：CSP 补 `media-src 'self' data: blob: https:`
- **Fix**：`generate_audio` 统一为顶层字段（去除旧 `parameters.generateAudio`）
- **New**：`safeParseJson` 处理 HTML 错误响应
- **New**：`/test/video` 测试页
