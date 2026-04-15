# Design Tokens

> 所有颜色 / 字号 / 间距 / 圆角 / 阴影的**唯一来源**。禁止在业务代码里硬编码色值（引用 token 名即可）。

## 颜色

### 品牌
| Token | Value | 用途 |
|-------|-------|------|
| `--brand` | `#00d26a` | 主 CTA 按钮、重点数据 |
| `--brand-dim` | `#00a354` | hover 态 |
| `--brand-faint` | `rgba(0,210,106,0.12)` | 浅背景强调 |

### 中性（明暗双主题）
| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `#f5f5f7` | `#0b0b0c` |
| `--surface` | `#ffffff` | `#1a1a1a` |
| `--text-primary` | `#0b0b0c` | `#ffffff` |
| `--text-secondary` | `#666666` | `rgba(255,255,255,0.68)` |
| `--text-tertiary` | `#999999` | `rgba(255,255,255,0.35)` |
| `--border` | `#e6e6e6` | `rgba(255,255,255,0.08)` |

### 语义
| Token | Value | 用途 |
|-------|-------|------|
| `--success` | `#00d26a` | |
| `--warning` | `#ff9500` | |
| `--danger` | `#ff3b30` | |
| `--info` | `#0a84ff` | |

## 字体

| Token | Value |
|-------|-------|
| font-family | `-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, Arial, sans-serif` |
| mono | `Menlo, Monaco, monospace` |

| 层级 | size / weight / line-height |
|------|---|
| h1 | 28px / 700 / 1.2 |
| h2 | 20px / 700 / 1.3 |
| h3 | 16px / 600 / 1.4 |
| body | 14px / 400 / 1.5 |
| small | 12px / 400 / 1.4 |
| kbd/code | 12px / 500 mono |

## 间距

4px 基线栅格：`4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`。

## 圆角

| Token | Value | 用途 |
|-------|-------|------|
| `radius-sm` | 6px | 输入框 |
| `radius-md` | 8px | 按钮 |
| `radius-lg` | 12px | 卡片 |
| `radius-pill` | 980px | Primary CTA |

## 阴影

| Token | Value |
|-------|-------|
| `shadow-sm` | `0 1px 3px rgba(0,0,0,0.06)` |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` |
| `shadow-lg` | `0 8px 40px rgba(0,0,0,0.5)`（设备框等深色场景） |

## 断点

| Token | Value |
|-------|-------|
| mobile | ≤ 640px |
| tablet | 641–1024px |
| desktop | ≥ 1025px |

## 动效

| Token | Value |
|-------|-------|
| `motion-fast` | 150ms ease-out |
| `motion-base` | 200ms ease-out |
| `motion-slow` | 400ms cubic-bezier(0.4,0,0.2,1) |

## 使用规范

1. 新页面的颜色/字号必须引用本表 token 名。
2. 若缺少 token，先在本表新增（PR 里说明理由），再在代码中使用。
3. 本表变更需设计 + 研发双签。
