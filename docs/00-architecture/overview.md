# 架构总览

## 产品定位

Moboost MAAS 是面向 iGaming/效果营销团队的 **营销资产生成 SaaS**。核心链路：

```
用户意图 (一句话)
    │
    ▼
Brief 模块 ── 意图识别 / 事实收集 / 专家搜索
    │
    ├── Report 模块 ── 生成营销报告 & 演化版本
    ├── Landing 模块 ── 生成可预览的落地页 HTML
    └── Video 模块 ── 调 VEO 3.1 生成短视频
          │
          ▼
    用户预览 / 下载 / 发布
```

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js 14 App Router + React 18 |
| 样式 | CSS-in-JS（内联 style）+ 少量全局 CSS |
| 鉴权 | Clerk v6（页面走 middleware，API 走 auth()） |
| 持久化 | Supabase（Postgres + Storage） |
| LLM | OpenRouter 代理（多模型：Claude / GPT / Gemini） |
| 视频 | OpenRouter → Google VEO 3.1 |
| 部署 | Vercel |

## 运行时分层

```
┌──────────────────────────────────────────────┐
│ Presentation（React 页面 + 组件）           │  src/app/**, src/components/**
├──────────────────────────────────────────────┤
│ API（Next.js Route Handlers）                │  src/app/api/**
├──────────────────────────────────────────────┤
│ Domain（业务逻辑 / LLM 编排）                │  src/lib/*Generator.ts, *Detector.ts
├──────────────────────────────────────────────┤
│ Infrastructure（外部服务适配）               │  src/lib/openrouter.ts, db.ts, storage.ts
└──────────────────────────────────────────────┘
```

**规则**：
- Presentation 只允许调 API 层（fetch `/api/*`），**不能直接 import** Domain/Infrastructure。
- API 层是唯一的"跨层调用枢纽"，负责鉴权 + 输入校验 + 调用 Domain。
- Domain 不关心 HTTP/React，只接收纯数据、返回纯数据。
- Infrastructure 封装外部依赖（OpenRouter / Supabase），domain 通过它访问外部世界。

见 [module-map.md](./module-map.md) 查看各模块的具体归属。

## 模块边界

每个业务模块都包含：**页面 + API + domain + 测试页 + 文档**。完整清单见模块地图。

本产品坚持「按模块分目录」优于「按技术层分目录」——避免一个功能改 5 个不相关的文件夹。

## 相关文档

- [模块地图与依赖关系](./module-map.md)
- [高内聚低耦合原则](./principles.md)
