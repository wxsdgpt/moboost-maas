# UI：Landing 模块

## 页面 & 组件

- `/landing/[id]` — 落地页详情 / 下载
- `DevicePreviewModal` — 设备预览模态（可被 Report 调用）
- `/test/preview` — 测试页

## 信息架构（预览模态）

```
┌──────────────────────────────────────────────┐
│  × 关闭                             Preview │
│  ┌────────────────────────────────────────┐ │
│  │ 设备 chip：iPhone / iPhone Max / SE /  │ │
│  │            Pixel / iPad / Desktop      │ │
│  └────────────────────────────────────────┘ │
│                                              │
│        ┌─────────────────┐                   │
│        │                 │                   │
│        │   iframe（blob）│                   │
│        │                 │                   │
│        └─────────────────┘                   │
│       393 × 852 px · Esc 关闭                │
└──────────────────────────────────────────────┘
```

## 状态

| 状态 | 视觉 |
|------|------|
| html 空 | "Loading preview..." 灰字 |
| 加载中 | iframe 白底，浏览器自身 loading |
| 成功 | 渲染完整 LP |

## 关键交互

- 点遮罩 / Esc → 关闭
- 切设备 → iframe 尺寸变化 + 自适应缩放（`scale`）
- `key={blobUrl}` 保证 URL 变化时 iframe 强制重挂

## 视觉规范

- 遮罩：`rgba(0,0,0,0.85)` + `backdrop-filter: blur(8px)`
- 设备框：`#1d1d1f` 深灰 + 3px 边 + `radius` 按设备
- iPhone 系列显示灵动岛条

## 响应式

- 自动缩放：`scale = min(viewportH / deviceH, viewportW / deviceW, 1)`
- 不放大（scale ≤ 1）

## 验收走查

- [ ] blob URL 生成后 iframe **立即可见**（useState 触发 re-render）
- [ ] CSP 不拦截 iframe（blob 独立 origin）
- [ ] iframe 内 script 可执行（sandbox 含 `allow-scripts`）
- [ ] useEffect cleanup 中 `revokeObjectURL`
