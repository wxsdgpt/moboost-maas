# UI：Brief 模块

## 页面

- `/brief/execute` — 简报执行页（输入一句话 → 看到生成过程 → 得到 BriefBundle）

## 信息架构

```
┌─────────────────────────────────────────┐
│ 顶部：任务名 + 模型切换（ModelRouter）  │
├──────────────┬──────────────────────────┤
│ 左：输入 &   │ 右：实时输出             │
│ 简报表单     │  - ThinkingPanel         │
│              │  - UnifiedCollector      │
│              │  - 生成后：Brief 卡片     │
└──────────────┴──────────────────────────┘
```

## 状态

| 状态 | 视觉 |
|------|------|
| Idle | 左侧输入框 + "开始"按钮 |
| Running | ThinkingPanel 流式显示；UnifiedCollector 列出正在搜索的源 |
| Error | 顶部红 banner + 重试 |
| Done | 右侧出现折叠卡片：人群 / 市场 / 卖点 |

## 交互要点

- 按钮主色用 `--brand`，次要按钮 `--surface + --border`
- 思考流使用等宽字体 `mono` 渲染
- 信源可信度 < 0.5 时用 `--warning` 标橙

## 组件

- 复用：`UnifiedCollector`, `ThinkingPanel`, `ModelRouter`, `Sidebar`
- 模块私有：`_components/BriefCard.tsx`（暂未提取）

## 响应式

- Mobile：上下排列（输入 → 输出）
- Desktop：左右 40/60

## 验收走查

- [ ] 输入框有清晰 placeholder 和字符上限提示
- [ ] 信源展示区有"可信度"色彩编码
- [ ] Error 状态保留已输入内容
