# 测试：Video 模块

## 测试矩阵

| # | 类型 | 描述 | 预期 |
|---|------|------|------|
| T1 | 视觉 | 加载 Big Buck Bunny | 首帧显示 |
| T2 | 视觉 | 点击播放 | **能听到声音** |
| T3 | 视觉 | DevTools Console | 无 CSP 错误 |
| T4 | 视觉 | DevTools Network | mp4 200 OK |
| T5 | 集成 | `/api/generate-video` action=submit | 返回 jobId |
| T6 | 集成 | action=poll | status 流转：submitted → in_progress → completed |
| T7 | 集成 | action=download | 返回 videoUrl 或 base64 data URL |
| T8 | 集成 | OpenRouter 返回 HTML 错误页 | safeParseJson 返回友好错误（不抛 JSON.parse） |
| T9 | E2E | 在 /test/video 点 Submit to VEO | 端到端通过，视频替换为 VEO 输出 |

## 测试入口

- 视觉：`http://localhost:3000/test/video`
- fixture：`SAMPLE_VIDEO_WITH_AUDIO`（Big Buck Bunny CDN URL）

## 历史 bug 回归

| Bug | 复现 | 用例 |
|-----|------|------|
| 视频静音播放 | `<video muted autoPlay>` | T2 — 移除属性后能听见 |
| CSP 拦截 mp4 | 没有 `media-src` | T3/T4 — 修 CSP 后无错 |
| `Unexpected token '<'` | OpenRouter 返回维护页 | T8 — safeParseJson 兜底 |

## 待补

- [ ] mock OpenRouter 服务做 T6/T7/T8 自动化
- [ ] 跨浏览器测试（Safari / Chrome / Firefox）
