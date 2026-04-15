# UI：Video 模块

Video 模块本身不提供独立页面，播放器嵌在 Report 内。

## 播放器规范

```tsx
<video
  src={videoData || videoUrl}
  controls
  loop
  playsInline
  preload="metadata"
  style={{ width: '100%', height: 'auto', display: 'block', background: '#000' }}
/>
```

**关键约束**：

- ❌ **不要** `autoPlay`
- ❌ **不要** `muted`（这两个会让浏览器静音播放，用户抱怨"没声音"的根因）
- ✅ `playsInline` → iOS 不全屏
- ✅ `preload="metadata"` → 预取首帧用于 poster
- ✅ 外层容器背景 `#000`

## 状态

| 状态 | 视觉 |
|------|------|
| 生成中 | 进度条 + 文字"生成中… (耗时 60–180 秒)" |
| 失败 | 红 banner + error message + 重试 |
| 成功 | 播放器 + 下载按钮 |

## 验收走查

- [ ] 点击播放按钮**能听到声音**
- [ ] DevTools Network 无 CSP 拦截
- [ ] 失败 message 可读（不是 "Unexpected token '<'"）

## 测试页

开发期可访问 `/test/video`，用 Big Buck Bunny 做视频 fixture，并可直连 VEO 做端到端。
