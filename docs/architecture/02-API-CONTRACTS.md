# Moboost MAAS API 契约文档

> 版本: v1.0 | 日期: 2026-04-24 | 状态: 已审核

---

## 一、概述

### 1.1 API 分层

| 层级 | 基础路径 | 认证方式 | 说明 |
|------|----------|----------|------|
| 前端 BFF | `/api/*` | Clerk Session | Next.js API Routes，面向浏览器 |
| 外部协作 | `/api/v1/collab/*` | Bearer Token | 对外开放的协作 API |
| 后端服务 | `/v1/*` (代理后 `/api/localization/v1/*`) | Service Token + JWT | FastAPI，面向内部 |

### 1.2 通用约定

**请求格式**: JSON (`Content-Type: application/json`)，文件上传使用 `multipart/form-data`

**响应格式 (前端 BFF)**:
```json
// 成功
{ "ok": true, "data": { ... } }

// 失败
{ "ok": false, "error": "错误描述" }
```

**响应格式 (后端 FastAPI)**: 直接返回数据对象或数组，错误使用 HTTP 状态码 + `detail` 字段。

**通用错误码**:

| HTTP 状态码 | 含义 | 说明 |
|------------|------|------|
| 400 | Bad Request | 请求参数校验失败 |
| 401 | Unauthorized | 未认证或 Token 过期 |
| 403 | Forbidden | 无权限访问此资源 |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 状态冲突 (如重复提交) |
| 422 | Unprocessable Entity | 语义错误 (Pydantic 校验失败) |
| 500 | Internal Server Error | 服务器内部错误 |

---

## 二、前端 BFF API

### 2.1 Brief 管线

#### POST /api/brief/parse

将自然语言营销描述解析为结构化 Brief 输入。

**请求体**:
```json
{
  "text": "string (required) — 用户输入的营销描述"
}
```

**响应 (200)**:
```json
{
  "ok": true,
  "intake": {
    "text": "string | null",
    "urls": ["string"],
    "targetSpecs": ["string"],
    "specAutoDetect": true
  }
}
```

---

#### POST /api/brief/execute

执行完整 Brief 流程，生成创意素材与落地页。

**请求体**:
```json
{
  "reportId": "string (required) — 关联的报告 ID",
  "productId": "string (required) — 产品 ID",
  "audienceGroups": [
    {
      "groupId": "string",
      "audienceTag": "string",
      "region": "string"
    }
  ]
}
```

**响应 (200)**:
```json
{
  "ok": true,
  "results": [
    {
      "groupId": "string",
      "audienceTag": "string",
      "region": "string",
      "creative": {
        "headline": "string",
        "bodyCopy": "string",
        "ctaText": "string",
        "format": "string",
        "visualDescription": "string"
      },
      "landingPageHtml": "string"
    }
  ]
}
```

---

#### POST /api/brief/clarify

LLM 生成澄清问题，帮助用户完善 Brief。

#### POST /api/brief/enrich

使用市场数据丰富 Brief 内容。

#### POST /api/brief/agent

代理式 Brief 运行器，支持多轮对话。

#### POST /api/brief/expert-search

搜索行业专家数据辅助 Brief。

#### POST /api/brief/fetch-url

抓取 URL 内容作为 Brief 上下文。

#### POST /api/brief/regenerate-creative

重新生成创意内容 (不影响其他部分)。

#### POST /api/brief/regenerate-landing

重新生成落地页 HTML。

#### POST /api/brief/save-creative

持久化创意输出到数据库。

---

### 2.2 项目管理

#### GET /api/projects

列出当前用户的所有项目。

**响应 (200)**:
```json
{
  "ok": true,
  "projects": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string",
      "status": "active | archived",
      "source": "string",
      "metadata": {},
      "created_at": "ISO 8601",
      "updated_at": "ISO 8601",
      "product_id": "uuid | null",
      "products": {
        "id": "uuid",
        "name": "string",
        "url": "string",
        "category": "string",
        "enrichment_status": "pending | done"
      },
      "counts": {
        "reports": 0,
        "landingPages": 0,
        "assets": 0
      }
    }
  ]
}
```

---

#### POST /api/projects

创建新项目。

**请求体**:
```json
{
  "name": "string (required)",
  "description": "string",
  "product_id": "uuid"
}
```

---

#### GET /api/projects/[id]

获取项目详情 (含关联的报告、素材、落地页、对话历史)。

**路径参数**: `id` — 项目 UUID

**响应 (200)**:
```json
{
  "ok": true,
  "project": { "...项目字段" },
  "reports": [
    {
      "id": "uuid",
      "kind": "lite | full | competitive-brief",
      "status": "string",
      "credits_charged": 0,
      "created_at": "ISO 8601"
    }
  ],
  "assets": [
    {
      "id": "uuid",
      "type": "image | video",
      "prompt": "string",
      "url": "string",
      "thumbnail": "string",
      "model": "string",
      "dimensions": { "width": 0, "height": 0 },
      "evaluation": {},
      "status": "string"
    }
  ],
  "landingPages": [
    {
      "id": "uuid",
      "template_id": "string",
      "status": "string",
      "html": "string"
    }
  ],
  "conversations": [
    {
      "id": "uuid",
      "role": "user | assistant",
      "content": "string",
      "intent": "string"
    }
  ]
}
```

---

#### PATCH /api/projects/[id]

更新项目信息。

#### DELETE /api/projects/[id]

软归档项目 (设置 status = archived)。

---

### 2.3 内容生成

#### POST /api/generate

生成图片或视频素材。

**请求体**:
```json
{
  "prompt": "string (required) — 生成提示词",
  "type": "video | image (default: image)"
}
```

**模型路由**: `video` → `google/veo-3.1`, `image` → `google/gemini-3-pro-image-preview` (可通过环境变量覆盖)

**响应 (200)**:
```json
{
  "ok": true,
  "resultText": "string",
  "imageData": "data:image/png;base64,...",
  "allImages": ["data:image/png;base64,..."]
}
```

---

#### POST /api/reports/generate

生成营销分析报告，扣减积分。

**请求体**:
```json
{
  "productId": "string (required)",
  "kind": "lite | full | competitive-brief (default: lite)",
  "projectId": "string (optional)"
}
```

**积分消耗**: lite = 3, full = 定义在 CREDIT_COSTS

**响应 (200)**:
```json
{
  "ok": true,
  "report": {
    "id": "uuid",
    "kind": "string",
    "status": "string",
    "credits_charged": 3,
    "created_at": "ISO 8601"
  }
}
```

---

### 2.4 文件上传

#### POST /api/upload

上传素材文件。

**请求格式**: `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| file | File | 是 | 素材文件 |
| briefId | string | 否 | 关联的 Brief ID |

**限制**: 50 MB (可通过 `MAX_UPLOAD_BYTES` 环境变量配置)

**允许的 MIME 类型**: `image/*`, `video/*`, `application/pdf`

**响应 (201)**:
```json
{
  "ok": true,
  "asset": {
    "url": "/uploads/20260424/uuid.png",
    "filename": "string",
    "size": 1234567,
    "mimeType": "image/png",
    "dimensions": { "width": 1920, "height": 1080 },
    "validation": {
      "specId": "string",
      "passed": true,
      "violations": []
    }
  }
}
```

---

### 2.5 积分系统

#### GET /api/credits/balance

获取当前用户积分余额 (前端每 30 秒轮询)。

**响应 (200)**:
```json
{
  "ok": true,
  "total": 100,
  "bySource": {
    "subscription": 50,
    "bonus": 30,
    "topup": 20
  }
}
```

---

### 2.6 状态持久化

#### POST /api/store/persist

将项目状态写入服务端磁盘。

**请求体**:
```json
{
  "project": {
    "id": "string (required)",
    "...其他 ProjectRecord 字段"
  }
}
```

**响应 (200)**: `{ "ok": true, "path": "string" }`

#### GET /api/store/restore

从磁盘恢复项目状态。

#### GET /api/store/info

获取存储信息。

#### DELETE /api/store/persist?projectId=xxx

删除指定项目的持久化数据。

---

### 2.7 管理后台

#### POST /api/admin/auth

管理员认证。

#### GET /api/admin/config

获取系统配置。

#### GET /api/admin/counts

获取使用统计数据。

#### GET /api/admin/data

获取管理数据。

#### POST /api/admin/mutations

执行管理操作。

#### GET/PUT /api/admin/prompts/[id]

Prompt 模板管理。

#### GET /api/admin/evolution

迭代控制面板数据。

#### GET /api/admin/intelligence

市场情报配置。

---

### 2.8 外部协作 API

#### GET /api/v1/collab/health

协作 API 健康检查。

**认证**: Bearer Token (Collab Token，非 Clerk)

**响应 (200)**:
```json
{
  "ok": true,
  "token": {
    "id": "string",
    "name": "string",
    "prefix": "string"
  },
  "serverTime": "2026-04-24T00:00:00Z"
}
```

#### GET /api/v1/collab/assets/[assetId]/localizations

获取素材的本地化版本列表。

#### GET /api/v1/collab/landings/[landingId]/localizations

获取落地页的本地化版本列表。

#### GET /api/v1/collab/reports/[reportId]/exports

获取报告的导出文件。

#### POST /api/v1/collab/uploads

通过协作 API 上传素材。

---

### 2.9 其他

#### GET /api/health

前端 API 健康检查。

#### GET /api/me

获取当前用户信息。

#### POST /api/onboarding/complete

标记用户已完成引导流程。

#### GET /api/meta

获取应用元数据。

#### POST /api/cron/market-intel/sync

定时同步市场情报数据。

---

## 三、后端 FastAPI API

> 基础路径: `/v1`，前端通过 `/api/localization/v1/*` 代理访问

### 3.1 认证

#### POST /v1/auth/login

用户登录。

**请求体**:
```json
{
  "email": "string",
  "password": "string"
}
```

**响应 (200)**: JWT access_token + refresh_token

#### POST /v1/auth/refresh

刷新 JWT Token。

#### GET /v1/auth/me

获取当前认证用户信息。

---

### 3.2 素材管理

#### POST /v1/assets/upload

上传源素材文件。

**请求格式**: `multipart/form-data`

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| project_id | UUID | 是 | 所属项目 |
| tags | string | 否 | 逗号分隔标签 |
| file | UploadFile | 是 | 素材文件 (≤500MB) |

**响应 (201) — SourceAssetOut**:
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "brand_id": "uuid",
  "uploaded_by": "uuid",
  "source_type": "image | video | text | psd",
  "original_filename": "string",
  "storage_key": "string",
  "source_file_hash": "string",
  "size_bytes": 1234567,
  "has_editable_layers": false,
  "file_metadata": {},
  "tags": ["tag1"],
  "parse_status": "pending | running | done | failed",
  "parse_error": "string | null",
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

---

#### POST /v1/assets/upload-text

直接上传文本内容。

**请求体 — TextUploadIn**:
```json
{
  "project_id": "uuid (required)",
  "content": "string (1–200,000 chars, required)",
  "filename": "string (optional)",
  "format": "txt | md | csv",
  "tags": ["string"]
}
```

**响应 (201)**: SourceAssetOut

---

#### POST /v1/assets/from-url

从 URL 导入素材。

#### GET /v1/assets

列出素材。

#### GET /v1/assets/{asset_id}

获取单个素材详情。

---

### 3.3 本地化任务

#### POST /v1/jobs

创建本地化任务。

**请求体 — JobCreate**:
```json
{
  "source_asset_id": "uuid (required)",
  "targets": [
    {
      "market": "MarketEnum (required)",
      "sub_market": "string (optional)"
    }
  ]
}
```

**响应 (201) — JobOut**:
```json
{
  "id": "uuid",
  "source_asset_id": "uuid",
  "requested_by": "uuid",
  "target_markets": ["JP", "KR"],
  "strategy_matrix": {
    "lu_id": {
      "strategy": "translate | visual_edit | keep | audio",
      "confidence": 0.95
    }
  },
  "localization_modes": {
    "language": true,
    "compliance": true,
    "element_replace": false
  },
  "status": "draft | queued | running | completed | failed",
  "started_at": "ISO 8601 | null",
  "completed_at": "ISO 8601 | null",
  "error_message": "string | null",
  "estimated_cost_usd": 0.05,
  "actual_cost_usd": 0.03,
  "created_at": "ISO 8601",
  "updated_at": "ISO 8601"
}
```

---

#### GET /v1/jobs

列出当前用户的任务。

**查询参数**: `limit=50`, `offset=0`

**响应**: `JobOut[]`

---

#### GET /v1/jobs/{job_id}

获取任务详情。

#### GET /v1/jobs/{job_id}/matrix

获取策略矩阵视图 (市场 × LU 的策略分配)。

#### PATCH /v1/jobs/{job_id}/matrix/cell

更新策略矩阵中的单个单元格。

#### POST /v1/jobs/{job_id}/submit

提交任务执行 (状态 draft → queued)。

#### GET /v1/jobs/{job_id}/localized

获取任务的所有本地化产出。

#### GET /v1/jobs/{job_id}/localized/{id}

获取单个本地化产出详情。

#### GET /v1/jobs/{job_id}/localized/{id}/download

下载本地化产出文件。

#### GET /v1/jobs/{job_id}/compliance

获取任务的合规检查结果。

---

### 3.4 解析结果

#### POST /v1/parsed/source/{source_asset_id}/parse

强制同步解析 (开发/重试用)。

**响应**: ParsedAssetOut

---

#### GET /v1/parsed/source/{source_asset_id}

获取源素材的解析结果。

**响应 — ParsedAssetDetail**:
```json
{
  "id": "uuid",
  "source_asset_id": "uuid",
  "parse_method": "string",
  "parse_model_used": "string",
  "parse_confidence": 0.95,
  "structural_metadata": {},
  "localizable_units": [
    {
      "id": "uuid",
      "type": "text | visual | audio",
      "content": "string",
      "bbox": { "x": 0, "y": 0, "w": 100, "h": 50 },
      "style": {},
      "created_at": "ISO 8601"
    }
  ],
  "created_at": "ISO 8601"
}
```

---

#### GET /v1/parsed/{parsed_id}/lus

列出解析结果的可本地化单元。

**响应**: LUOut[]

---

### 3.5 品牌管理

#### GET /v1/brands

列出品牌 (管理员: 全部; 普通用户: 仅成员关系)。

#### POST /v1/brands

创建品牌 (仅管理员)。

**请求体 — BrandCreate**:
```json
{
  "name": "string (required)",
  "slug": "string (required)",
  "display_name_by_market": { "JP": "ブランド名" },
  "restrictions": {},
  "voice": {},
  "lock_brand_name": false
}
```

#### GET /v1/brands/{brand_id}

获取品牌详情。

#### PATCH /v1/brands/{brand_id}

更新品牌信息。

---

### 3.6 合规引擎

#### GET /v1/compliance/rules

列出合规规则。

**查询参数**: `market` (可选，筛选市场 + 通配符 `*`)

**响应**: RuleOut[]

---

#### POST /v1/compliance/check/{localized_asset_id}

对本地化产出执行合规检查。

**响应 — CheckResult**:
```json
{
  "market": "JP",
  "sub_market": "string | null",
  "overall_status": "pass | fail | warning",
  "findings": [
    {
      "rule_code": "string",
      "severity": "error | warning | info",
      "description": "string",
      "recommendation": "string"
    }
  ],
  "effective_rule_count": 15,
  "disabled_rule_count": 2
}
```

---

#### POST /v1/compliance/confirm/{localized_asset_id}

确认合规已审核的素材可以分发。

---

### 3.7 导出

#### GET /v1/exports/platforms

列出支持的导出平台。

**响应**: `["meta_ads", "google_ads", "dsp_generic"]`

---

#### GET /v1/exports/{localized_asset_id}?platform=meta_ads

导出本地化素材为平台格式。

**前置条件**: 素材状态必须为 `confirmed` 或 `distributed`

**响应**: 二进制文件下载 (`Content-Disposition: attachment`)

首次导出时状态自动推进为 `distributed`。

---

### 3.8 报告

#### GET /v1/reports/cost

获取成本汇总报告。

#### GET /v1/reports/audit/{localized_asset_id}

获取审计包 (含源素材、规则、签核链)。

---

### 3.9 其他管理接口

#### GET/POST /v1/users — 用户管理

#### GET/PATCH /v1/sub-markets — 子市场配置

#### GET/POST/PUT/DELETE /v1/prompts — Prompt 覆盖管理 (仅管理员)

#### GET/PUT /v1/settings — 系统设置 (仅管理员)

#### GET /v1/markets — 市场列表

#### GET /v1/debug/latest-job — 调试: 最近的任务

---

### 3.10 健康检查

#### GET /v1/health

**响应 (200)**:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "env": "dev | staging | prod"
}
```

---

## 四、代理转发规则

### 4.1 前端 → 后端代理

```
/api/localization/v1/* → http://localhost:8000/v1/*
```

**实现**: `src/app/api/localization/[...path]/route.ts` (Catch-all Route)

**认证传递**: 附带 `Authorization: Bearer <SERVICE_TOKEN>` 头

**支持方法**: GET, POST, PATCH, PUT, DELETE

### 4.2 超时配置

| 场景 | 超时 |
|------|------|
| 普通 API 调用 | 30s |
| 文件上传 | 120s |
| AI 生成 (Brief/Generate) | 180s |
| 本地化 Pipeline | 无超时 (异步任务) |

---

## 附录

### A. 状态机

**Job 状态流转**:
```
draft → queued → running → completed
                    │
                    └──→ failed
```

**Localized Asset 状态流转**:
```
pending → processing → completed → confirmed → distributed
              │
              └──→ failed
```

**Source Asset 解析状态**:
```
pending → running → done
             │
             └──→ failed
```

### B. 相关文档

- 系统架构: `docs/architecture/01-SYSTEM-ARCHITECTURE.md`
- 数据库 Schema: `docs/architecture/03-DATABASE-SCHEMA.md`
- 环境配置: `docs/ENV_GUIDE.md`
