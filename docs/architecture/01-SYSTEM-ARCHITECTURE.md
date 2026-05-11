# Moboost MAAS 系统架构文档

> 版本: v1.0 | 日期: 2026-04-24 | 状态: 已审核

---

## 一、系统概述

### 1.1 产品定位

Moboost MAAS (Marketing-as-a-Service) 是一个 AI 驱动的广告创意与本地化平台。系统接收品牌素材（图片、视频、PSD），通过 AI 解析、翻译、视觉编辑，自动生成符合目标市场法规与文化的本地化广告素材。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| Brief 智能生成 | 通过 LLM 解析用户输入，自动生成结构化创意 Brief |
| 多格式素材解析 | 支持 PNG/JPG/PSD/视频/文本，提取可本地化单元 (LU) |
| 多市场本地化 | 一键将素材适配到多个目标市场，包含翻译、视觉编辑、合规检查 |
| 合规引擎 | 基于 DSL 触发规则，自动检查广告法规合规性 |
| 报告与审计 | 生成成本报告、审计包，支持监管追溯 |

### 1.3 技术栈总览

| 层级 | 技术选型 | 版本 |
|------|----------|------|
| 前端框架 | Next.js (App Router) | ^14.2 |
| UI 样式 | Tailwind CSS | ^3.4 |
| 认证 | Clerk | ^6.12 |
| 数据库 | Supabase (PostgreSQL) | ^2.45 |
| 后端框架 | FastAPI | >=0.115 |
| ORM | SQLAlchemy (Async) | >=2.0 |
| 任务队列 | Procrastinate (PostgreSQL-backed) | >=3.0 |
| AI 接入 | OpenRouter (多模型路由) | — |
| 对象存储 | Supabase Storage / S3 | — |
| 日志框架 | structlog (后端) | >=24.4 |

---

## 二、整体架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        客户端 (浏览器)                               │
│  Next.js App Router │ Clerk Auth │ Tailwind │ Three.js              │
└────────────┬────────────────────────────────────┬───────────────────┘
             │ API Routes                         │ SSR/CSR
             ▼                                    │
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js API 层 (BFF)                              │
│  /api/brief/*  │  /api/generate  │  /api/projects  │  /api/admin/*  │
│  /api/reports  │  /api/store     │  /api/credits   │  /api/v1/collab│
└────────┬──────────────────┬─────────────────────────────────────────┘
         │ Direct DB        │ HTTP Proxy
         ▼                  ▼
┌────────────────┐  ┌───────────────────────────────────────────────┐
│   Supabase     │  │          FastAPI Backend                      │
│  (PostgreSQL)  │  │  /v1/assets  │  /v1/jobs    │  /v1/brands    │
│  + Storage     │  │  /v1/parsed  │  /v1/compliance │ /v1/exports │
│                │  │  /v1/markets │  /v1/prompts │  /v1/reports   │
└────────────────┘  └────────┬─────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │  Service Layer   │
                    │  orchestrator    │
                    │  parse / apply_lu│
                    │  localize_text   │
                    │  visual_edit     │
                    │  compliance_check│
                    │  compose_output  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐  ┌──────────┐  ┌──────────────┐
        │PostgreSQL│  │OpenRouter│  │  S3/Storage   │
        │(SQLAlchemy)│ │(AI APIs) │  │  (素材存储)    │
        └──────────┘  └──────────┘  └──────────────┘
```

### 2.2 数据流

```
用户上传素材
    │
    ▼
[1] 素材存储 → Supabase Storage / S3
    │
    ▼
[2] 创建 Source Asset 记录
    │
    ▼
[3] 触发解析 (parse)
    │  ├── Image Parser (Vision LLM)
    │  ├── Video Parser (帧提取)
    │  ├── Text Parser (NLP)
    │  └── PSD Parser (图层提取)
    │
    ▼
[4] 生成 Parsed Asset + Localizable Units (LU)
    │
    ▼
[5] 用户配置目标市场 → 创建 Localization Job
    │
    ▼
[6] Strategy Resolver → 为每个 LU 制定策略 (翻译/视觉编辑/保留/音频)
    │
    ▼
[7] Orchestrator 按市场并行执行
    │  ├── localize_text → 翻译文本 LU (17 层 Prompt 组装)
    │  ├── visual_edit → 编辑视觉 LU (Nano Banana + Mask)
    │  ├── video_editor → 视频文字替换
    │  └── video_audio_regen → 音频再生成
    │
    ▼
[8] compose_output → 合成最终素材
    │
    ▼
[9] compliance_check → 合规检查 (DSL 规则引擎)
    │
    ▼
[10] review → 二次 LLM 审核
    │
    ▼
[11] 生成 Localized Asset → 用户预览/下载/导出
```

### 2.3 部署架构

| 组件 | 部署方式 | 说明 |
|------|----------|------|
| 前端 | Vercel / Docker | Next.js SSR + Edge Runtime |
| 后端 | Docker / Cloud Run | FastAPI + Uvicorn |
| 数据库 | Supabase Cloud / 自建 PostgreSQL | 含 RLS 策略 |
| 存储 | Supabase Storage / AWS S3 | 配置驱动切换 |
| 任务队列 | Procrastinate (复用 PostgreSQL) | 无额外基础设施 |

---

## 三、前端架构

### 3.1 目录结构

```
src/
├── app/                          # Next.js App Router
│   ├── (main)/                   # 主应用布局组
│   │   ├── brief/                # Brief 创建流程
│   │   ├── evolution/            # Campaign 迭代
│   │   ├── inspire/              # 创意灵感
│   │   ├── localization/         # 本地化管理
│   │   ├── project/[id]/         # 项目详情
│   │   ├── report/[id]/          # 报告查看
│   │   └── specs/                # 素材规格
│   ├── (admin)/admin/            # 管理后台
│   │   ├── prompts/              # Prompt 管理
│   │   ├── evolution/            # 迭代控制
│   │   └── intelligence/         # 市场情报
│   ├── api/                      # API Routes (BFF)
│   │   ├── brief/                # Brief 管线 (9 端点)
│   │   ├── projects/             # 项目 CRUD
│   │   ├── reports/              # 报告生成
│   │   ├── admin/                # 管理接口
│   │   ├── v1/collab/            # 外部协作 API
│   │   └── localization/[...path]/ # FastAPI 代理
│   ├── sign-in/ & sign-up/       # Clerk 认证页
│   └── onboarding/               # 新用户引导
├── components/                   # 共享组件
│   ├── Sidebar.tsx               # 主导航
│   ├── ThemeProvider.tsx          # 暗色/亮色主题
│   ├── ModelRouter.tsx            # LLM 模型路由器
│   ├── UnifiedCollector.tsx       # 统一数据收集
│   └── ThinkingPanel.tsx          # AI 思考过程展示
├── lib/                          # 核心库
│   ├── auth.ts                   # Clerk → Supabase 桥接
│   ├── db.ts                     # Supabase 客户端单例
│   ├── callLLM.ts                # LLM 调用封装
│   ├── creditLedger.ts           # 积分账本
│   ├── marketIntel/              # 市场情报子模块
│   └── localization/             # 国际化
└── middleware.ts                  # 认证中间件
```

### 3.2 认证流程

```
请求进入
  │
  ▼
middleware.ts (Clerk v6)
  ├── 公开路由 (/sign-in, /api/*, /admin/*, /test/*) → 放行
  ├── AUTH_BYPASS=true → 跳过所有认证 (QA 环境)
  └── 受保护路由
       ├── 未认证 → 302 /sign-in?redirect_url=原始路径
       └── 已认证
            ├── 检查 onboarded_at (cookie 缓存 24h)
            │   ├── 未完成引导 → 302 /onboarding
            │   └── 已完成 → 放行
            └── auth.ts: Clerk userId → Supabase users 表 (懒创建)
```

### 3.3 BFF 代理模式

前端 API Routes 充当 BFF (Backend For Frontend)：

- **直连模式**: Brief、Projects、Reports 等直接通过 Supabase 客户端读写数据库
- **代理模式**: `/api/localization/[...path]` 将请求代理到 FastAPI 后端，附带 Service Token 认证
- **混合模式**: 部分接口先从 Supabase 读取上下文，再调用 OpenRouter API

---

## 四、后端架构

### 4.1 目录结构

```
services/ad-localization/backend/
├── app/
│   ├── main.py                   # FastAPI 应用入口
│   ├── config.py                 # Pydantic Settings (ADLOC_ 前缀)
│   ├── db.py                     # SQLAlchemy 异步引擎
│   ├── api/v1/                   # API 路由层
│   │   ├── assets.py             # 素材上传/查询
│   │   ├── jobs.py               # 本地化任务管理
│   │   ├── parsed.py             # 解析结果
│   │   ├── brands.py             # 品牌管理
│   │   ├── compliance.py         # 合规检查
│   │   ├── exports.py            # 导出适配
│   │   ├── reports.py            # 成本/审计报告
│   │   └── ...                   # (14 个路由模块)
│   ├── models/                   # SQLAlchemy ORM
│   │   ├── user.py               # 用户
│   │   ├── brand.py              # 品牌 + 术语表
│   │   ├── source_asset.py       # 源素材
│   │   ├── parsed_asset.py       # 解析结果
│   │   ├── localization_job.py   # 本地化任务
│   │   ├── localized_asset.py    # 本地化产出
│   │   ├── compliance.py         # 合规规则
│   │   └── ...                   # (17 张表)
│   ├── services/                 # 业务逻辑层
│   │   ├── orchestrator.py       # 任务编排器 (核心)
│   │   ├── parse.py              # 素材解析
│   │   ├── apply_lu.py           # LU 策略分发
│   │   ├── localize_text.py      # 文本翻译
│   │   ├── visual_edit.py        # 视觉编辑
│   │   ├── compose_output.py     # 输出合成
│   │   ├── compliance_check.py   # 合规引擎
│   │   ├── review.py             # AI 审核
│   │   └── ...                   # (23 个服务模块)
│   ├── prompt_assembly/          # Prompt 组装引擎
│   │   └── assembler.py          # 17 层 Prompt 组装
│   └── adapters/                 # AI 适配器
│       └── ai_adapter.py         # OpenRouter/OpenAI/Gemini/Anthropic
├── alembic/                      # 数据库迁移
│   └── versions/                 # 6 个迁移文件
├── parsers/                      # 素材解析器
│   ├── image_parser.py           # 图片 (Vision LLM)
│   ├── video_parser.py           # 视频 (帧提取)
│   ├── text_parser.py            # 文本 (NLP)
│   └── psd_parser.py             # PSD (图层)
└── pyproject.toml                # Python 依赖
```

### 4.2 服务层架构 (高内聚)

```
orchestrator.py (编排层)
    │
    ├── parse.py ──────── parsers/image|video|text|psd
    │
    ├── strategy_resolver.py ── 确定每个 LU 的处理策略
    │
    ├── apply_lu.py (分发层)
    │   ├── localize_text.py ── prompt_assembly/ ── ai_adapter
    │   ├── visual_edit.py ──── ai_adapter (image-edit)
    │   ├── video_editor.py ─── 帧级文字替换
    │   └── video_audio_regen.py ── Veo 3.1
    │
    ├── compose_output.py ─── 合成最终素材
    │
    ├── compliance_check.py ── DSL 规则引擎
    │
    └── review.py ──────── 二次 LLM 审核
```

每个服务模块只负责单一领域，通过 orchestrator 协调调用。模块间不直接依赖。

### 4.3 Prompt 组装引擎

系统使用 17 层可审计的 Prompt 组装方案：

| 层序 | 层名 | 来源 | 说明 |
|------|------|------|------|
| 1 | brand_voice | brands.voice | 品牌语调 |
| 2 | brand_restrictions | brands.restrictions | 品牌禁忌 |
| 3 | brand_glossary | glossary_entries | 品牌术语表 |
| 4 | brand_instructions | brands.prompt_additions | 品牌自定义指令 |
| 5 | market_language | 内置 | 目标语言指令 |
| 6 | market_compliance | compliance_rules | 市场法规要求 |
| 7 | market_culture | market_context | 文化适配指南 |
| 8 | market_audio | 内置 | 音频策略指令 |
| 9 | font_style | 内置 | 字体风格指令 |
| 10 | few_shot | 内置/数据库 | 少样本示例 |
| 11 | source_context | parsed_asset | 源素材上下文 |
| 12 | source_anchor | localizable_units | 锚定文本 |
| 13 | mask | 内置 | 编辑蒙版指令 |
| 14 | user_instruction | 用户输入 | 用户自定义指令 |
| 15 | prompt_overrides | prompt_overrides | 管理员覆盖 |
| 16 | (token budget) | — | 60,000 token 预算管理 |
| 17 | (truncation) | — | 超预算时裁剪 FewShot → SourceContext |

每次 Prompt 组装生成 `assembly_trace`，记录在 `ai_generation_logs` 表中，支持事后审计。

### 4.4 AI 适配器路由

```
AI 调用请求
    │
    ▼
ai_adapter.py
    ├── use_case = "text"     → ADLOC_TEXT_MODEL (默认 OpenRouter)
    ├── use_case = "vision"   → ADLOC_VISION_MODEL
    ├── use_case = "image_edit" → ADLOC_IMAGE_EDIT_MODEL
    ├── use_case = "video"    → ADLOC_VIDEO_MODEL
    └── use_case = "review_*" → 对应 REVIEWER_MODEL
```

支持运行时通过环境变量切换底层模型供应商 (OpenRouter / OpenAI / Gemini / Anthropic)。

---

## 五、数据库架构

### 5.1 核心实体关系

```
users ─────┐
           │ 1:N
           ▼
brand_memberships ──── brands ────┐
                         │        │ 1:N
                         │ 1:N    ▼
                         │   glossary_entries
                         │
                         ▼
                      projects
                         │ 1:N
                         ▼
                    source_assets
                         │ 1:1
                         ▼
                    parsed_assets
                         │ 1:N
                         ▼
                  localizable_units
                         │
            ┌────────────┤
            │            │
            ▼            ▼
   localization_jobs ─── localized_assets
            │                  │ 1:N
            │                  ▼
            │          compliance_units
            │
            ▼
   ai_generation_logs

独立表:
  sub_markets, compliance_rules, prompt_overrides,
  system_settings, audit_logs
```

### 5.2 表清单

| 表名 | 记录数量级 | 说明 |
|------|-----------|------|
| users | 百级 | 平台用户 |
| brands | 十级 | 品牌实体 |
| brand_memberships | 百级 | 用户-品牌关联 |
| glossary_entries | 千级 | 品牌术语表 |
| projects | 百级 | 项目 |
| source_assets | 千级 | 源素材文件 |
| parsed_assets | 千级 | 解析结果 |
| localizable_units | 万级 | 可本地化单元 |
| localization_jobs | 千级 | 本地化任务 |
| localized_assets | 万级 | 本地化产出 |
| sub_markets | 百级 | 子市场配置 |
| compliance_rules | 百级 | 合规规则 |
| compliance_units | 万级 | 合规检查结果 |
| ai_generation_logs | 万级 | AI 调用日志 |
| prompt_overrides | 十级 | Prompt 覆盖 |
| system_settings | 十级 | 系统设置 |
| audit_logs | 万级 | 审计日志 |

---

## 六、安全架构

### 6.1 认证层

| 层级 | 方案 | 说明 |
|------|------|------|
| 前端页面 | Clerk v6 (middleware) | SSO/邮箱登录，JWT Session |
| 前端 API | Clerk auth() | 每个 API Route 独立检查 |
| 后端 API | JWT + Service Token | 前端代理附带共享密钥 |
| 外部 API | Collab Token | 基于 Token 的外部访问 |
| 管理后台 | Admin Auth + is_system_admin | 双重检查 |

### 6.2 安全头配置

Next.js 配置了完整的安全响应头：

| 头 | 值 |
|------|------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| X-XSS-Protection | 1; mode=block |
| Content-Security-Policy | 限制 Clerk/Supabase/OpenRouter 来源 |

### 6.3 数据安全

| 措施 | 说明 |
|------|------|
| RLS | Supabase 行级安全策略 |
| 参数化查询 | SQLAlchemy ORM 防止 SQL 注入 |
| 输入校验 | Pydantic (后端) + Zod (前端) |
| 密钥管理 | 环境变量注入，不提交到代码库 |
| 日志脱敏 | API Key 仅前 8 位，邮箱脱敏，密码不记录 |

---

## 七、可观测性

### 7.1 日志体系

| 层级 | 框架 | 格式 |
|------|------|------|
| 后端 | structlog | 结构化 key-value (JSON) |
| 前端 | console.* | 统一前缀 [模块名] |

### 7.2 AI 调用追踪

每次 AI 调用记录到 `ai_generation_logs`：

| 字段 | 说明 |
|------|------|
| use_case | 调用场景 (text/vision/image_edit/review) |
| model | 使用的模型 |
| assembly_trace | Prompt 组装层追踪 (JSONB) |
| input_hash | 输入哈希 (用于 TM 缓存) |
| cost_usd | 调用成本 |

### 7.3 健康检查

| 端点 | 说明 |
|------|------|
| GET /api/health | 前端 API 健康 |
| GET /v1/health | 后端应用健康 (含版本、环境) |
| GET /api/v1/collab/health | 外部协作 API 健康 |

---

## 八、关键设计决策

### 8.1 为什么选 Procrastinate 而不是 Celery

| 维度 | Procrastinate | Celery |
|------|--------------|--------|
| 依赖 | 复用 PostgreSQL，无额外基础设施 | 需要 Redis/RabbitMQ |
| 运维 | 简单 | 需维护 Broker + Worker |
| 可靠性 | ACID 事务保证 | At-least-once |
| 适用规模 | 中小规模 (当前适合) | 大规模分布式 |

### 8.2 为什么选 OpenRouter 而不是直连 LLM

| 维度 | OpenRouter | 直连 |
|------|-----------|------|
| 模型切换 | 运行时切换，无代码改动 | 每个供应商需要适配代码 |
| 容灾 | 自动 fallback | 需自建 |
| 统一接口 | 一个 API 访问所有模型 | 多套 SDK |
| 成本 | 加价 ~5% | 直连价格 |

### 8.3 为什么前端直连 Supabase

- **Brief/项目/报告** 等读写操作通过 Supabase 客户端直连，减少后端负载
- **本地化 Pipeline** 涉及重计算，走 FastAPI 后端
- 通过 Supabase RLS 保证直连场景的数据安全
- 最终目标：所有写操作收敛到后端，前端仅读

---

## 九、技术债务与演进方向

### 9.1 已知技术债务

| 类别 | 问题 | 影响 | 建议 |
|------|------|------|------|
| 双数据库模式 | 前端 Supabase + 后端 SQLAlchemy 操作同一数据库 | Schema 同步风险 | 逐步收敛至后端单一入口 |
| 缺少类型共享 | 前后端类型定义不同步 | 联调成本高 | 引入 OpenAPI 自动生成 |
| 测试覆盖率 | 后端无测试文件 | 回归风险 | 补充核心 service 单元测试 |
| 缺少速率限制 | API 无 rate limiting | 被滥用风险 | 接入 API Gateway 或中间件 |

### 9.2 演进路线

```
当前 (v1.0)                    短期 (v1.5)                   中期 (v2.0)
──────────                    ──────────                    ──────────
Monolithic BFF               API Gateway 层                 微服务拆分
单一 PostgreSQL               读写分离                       独立 DB per service
同步处理为主                   异步优先                       事件驱动架构
手动部署                      CI/CD Pipeline                 GitOps + K8s
```

---

## 附录

### A. 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Next.js 前端 | 3000 | 开发/生产 |
| FastAPI 后端 | 8000 | 开发/生产 |
| PostgreSQL | 5432 | 数据库 |

### B. 环境变量分组

| 分组 | 前缀 | 数量 |
|------|------|------|
| Clerk 认证 | NEXT_PUBLIC_CLERK_ / CLERK_ | 4 |
| Supabase | NEXT_PUBLIC_SUPABASE_ / SUPABASE_ | 4 |
| OpenRouter | OPENROUTER_ | 2 |
| 后端核心 | ADLOC_ | 20+ |
| 存储 | ADLOC_STORAGE_ / ADLOC_S3_ | 6 |
| AI 模型 | ADLOC_*_MODEL | 8 |

### C. 相关文档

- 依赖清单: `docs/DEPENDENCIES.md`
- 环境配置指南: `docs/ENV_GUIDE.md`
- 产研流程: `docs/process/`
- API 契约: `docs/architecture/02-API-CONTRACTS.md`
- 数据库 Schema: `docs/architecture/03-DATABASE-SCHEMA.md`
