# UI：Report 模块

## 页面

- `/report/[id]` — 报告详情
- `/evolution/[id]` — 演化对比

## 信息架构

```
┌─────────────────────────────────────────┐
│ 顶部：标题 + SpecValidationBadge + 操作 │
├─────────────────────────────────────────┤
│ Tab: 人群 / 市场 / 卖点 / 视觉 / 视频   │
├─────────────────────────────────────────┤
│ Tab 内容区                              │
│  - 视频 Tab：内嵌 <video>（无 muted）   │
│  - 落地页 Tab：按钮唤起 DevicePreviewModal │
└─────────────────────────────────────────┘
```

## 状态

| 状态 | 视觉 |
|------|------|
| Loading | 骨架屏（Tab 占位） |
| Invalid Spec | SpecValidationBadge 红色 + 下方提示重新生成 |
| Evolving | 右上角 chip: "v2 生成中" |

## 关键交互

- 视频：`controls loop playsInline`，**禁止加 `muted`**
- 落地页预览：点击 "Preview" 按钮 → 唤起 `DevicePreviewModal`
- "Evolve" 按钮：右上角，次要按钮样式，点击弹出 prompt 输入框

## 组件

- 复用：`ModelRouter`, `SpecValidationBadge`, `DevicePreviewModal`
- 模块私有：`_components/ReportTab.tsx`, `VideoBlock.tsx`

## 响应式

- 移动端：Tab 改为抽屉菜单
- 视频：`width: 100%, height: auto`

## 验收走查

- [ ] 视频有声音（抽取一个测试 video 验证）
- [ ] 校验失败时有明显红色提示
- [ ] 演化对比页左右两栏等高滚动
