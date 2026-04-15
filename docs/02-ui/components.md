# 共享组件清单

> 存放于 `src/components/`。写新组件前先查此表，避免重复。

## 布局类

| 组件 | 文件 | 职责 | 依赖 |
|------|------|------|------|
| `Sidebar` | `Sidebar.tsx` | 主导航（user 侧） | ThemeStore |
| `AdminSidebar` | `AdminSidebar.tsx` | admin 导航 | adminAuth |
| `MainContent` | `MainContent.tsx` | 主内容容器 | — |
| `ThemeProvider` | `ThemeProvider.tsx` | 明/暗主题 | themeStore |
| `ThemeToggle` | `ThemeToggle.tsx` | 切换按钮 | ThemeProvider |

## 功能类

| 组件 | 文件 | 职责 |
|------|------|------|
| `UnifiedCollector` | `UnifiedCollector.tsx` | Brief 阶段的事实收集展示 |
| `ThinkingPanel` | `ThinkingPanel.tsx` | LLM 思考步骤的流式展示 |
| `ModelRouter` | `ModelRouter.tsx` | 切换 LLM 模型（Claude/GPT/Gemini） |
| `SpecValidationBadge` | `SpecValidationBadge.tsx` | 校验通过与否的徽标 |
| `CreditBalance` | `CreditBalance.tsx` | 积分余额气泡 |
| `DevicePreviewModal` | `DevicePreviewModal.tsx` | 落地页设备预览（见 Landing 模块） |
| `Notifications` | `Notifications.tsx` | 全局通知 |
| `WelcomeBanner` | `WelcomeBanner.tsx` | 首次登录欢迎条 |
| `UserScopeGuard` | `UserScopeGuard.tsx` | 权限边界包裹器 |
| `AdminMutationBanner` | `AdminMutationBanner.tsx` | 管理端危险操作确认 |
| `LastPathTracker` | `LastPathTracker.tsx` | 记录路径用于面包屑 |
| `ParticleFlow` | `ParticleFlow.tsx` | 背景装饰动画 |

## 新增组件的标准

在以下任一条件满足时，组件**应该放到 `src/components/`**：

1. 超过 1 个模块使用
2. 与具体业务无关（通用 UI primitive）
3. 依赖主题 / 全局状态

否则留在 `src/app/<module>/_components/` 模块内私有目录。

## 组件接口规范

```tsx
type Props = {
  // 必填
  data: DomainType              // ← 引用 domain 类型，不自定义
  // 可选
  onAction?: (x: T) => void
  // 样式注入（如需）
  style?: React.CSSProperties
  className?: string
}

export default function MyComponent(props: Props) { ... }
```

**禁止**：
- ❌ 在组件内直接 `fetch('/api/...')`（数据获取交给 page 或 hook）
- ❌ 在组件内直接 import `openrouter.ts` 等 Infrastructure
- ❌ 组件内写死颜色值（引用 design tokens）
