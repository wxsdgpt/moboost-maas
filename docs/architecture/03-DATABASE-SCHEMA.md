# Moboost MAAS 数据库 Schema 文档

> 版本: v1.0 | 日期: 2026-04-24 | 数据库: PostgreSQL 16 | ORM: SQLAlchemy 2.0 (Async)

---

## 一、概述

### 1.1 数据库架构

- **引擎**: PostgreSQL 16 (Alpine)
- **连接**: SQLAlchemy AsyncIO + psycopg3
- **连接池**: pool_size=10, max_overflow=20, pool_pre_ping=True
- **迁移**: Alembic (6 个迁移文件)
- **任务队列**: Procrastinate (复用同一 PostgreSQL 实例)

### 1.2 表统计

| 分类 | 数量 | 表名 |
|------|------|------|
| 用户与品牌 | 4 | users, brand_memberships, brands, glossary_entries |
| 项目与素材 | 3 | projects, source_assets, parsed_assets |
| 本地化单元 | 2 | localizable_units, compliance_units |
| 任务与产出 | 2 | localization_jobs, localized_assets |
| 合规体系 | 6 | compliance_rules, brand_rule_overrides, brand_override_change_logs, brand_reason_requirement_configs, compliance_check_reports, asset_confirmations |
| 市场配置 | 3 | sub_markets, brand_us_operations, brand_ng_operations, brand_in_configs |
| AI 与成本 | 3 | ai_generation_logs, translation_memory_entries, cost_records |
| 系统管理 | 3 | prompt_overrides, system_settings, audit_logs |
| **合计** | **26** | |

### 1.3 通用约定

所有表共享以下基础字段 (通过 Mixin):

| Mixin | 字段 | 类型 | 说明 |
|-------|------|------|------|
| UUIDPrimaryKeyMixin | id | UUID | 主键，默认 uuid4 |
| TimestampMixin | created_at | TIMESTAMPTZ | 创建时间，默认 now() |
| TimestampMixin | updated_at | TIMESTAMPTZ | 更新时间，默认 now()，自动更新 |

---

## 二、实体关系图 (ER Diagram)

```
                            ┌──────────────┐
                            │    users     │
                            │──────────────│
                            │ email (UQ)   │
                            │ external_id  │
                            │ primary_role │
                            │ is_system_admin│
                            └──────┬───────┘
                                   │
                          1:N      │      N:1
                    ┌──────────────┼──────────────┐
                    ▼              │              ▼
           ┌────────────────┐     │     ┌──────────────┐
           │brand_memberships│     │     │   brands     │
           │────────────────│     │     │──────────────│
           │ user_id (FK)   │     │     │ slug (UQ)    │
           │ brand_id (FK)  │     │     │ voice (JSONB)│
           │ role           │     │     │ restrictions │
           │ (UQ: user+brand)│    │     │ lock_brand_name│
           └────────────────┘     │     └──────┬───────┘
                                  │            │
                           ┌──────┘      ┌─────┴─────┐
                           │             │           │
                           ▼             ▼           ▼
                    ┌────────────┐ ┌──────────┐ ┌───────────────┐
                    │  projects  │ │glossary_ │ │brand_rule_    │
                    │────────────│ │entries   │ │overrides      │
                    │ brand_id   │ │──────────│ │───────────────│
                    │ name       │ │brand_id  │ │brand_id       │
                    │ tags (JSON)│ │source_term│ │system_rule_id │
                    └─────┬──────┘ │translations││override_type  │
                          │        └──────────┘ └───────────────┘
                          │ 1:N
                          ▼
                   ┌──────────────┐
                   │source_assets │
                   │──────────────│
                   │ project_id   │
                   │ source_type  │
                   │ storage_key  │
                   │ parse_status │
                   └──────┬───────┘
                          │ 1:1
                          ▼
                   ┌──────────────┐
                   │parsed_assets │
                   │──────────────│
                   │source_asset_id (UQ)│
                   │ parse_method │
                   │ parse_confidence│
                   └──────┬───────┘
                          │ 1:N
                    ┌─────┴──────┐
                    ▼            ▼
            ┌──────────────┐ ┌──────────────┐
            │localizable_  │ │compliance_   │
            │units         │ │units         │
            │──────────────│ │──────────────│
            │parsed_asset_id││parsed_asset_id│
            │ lu_type      │ │element_type  │
            │source_content│ │market_content│
            │source_location│└──────────────┘
            └──────────────┘

    ┌──────────────────┐              ┌──────────────────┐
    │localization_jobs │──── 1:N ────▶│localized_assets  │
    │──────────────────│              │──────────────────│
    │ source_asset_id  │              │ job_id           │
    │ target_markets   │              │ source_asset_id  │
    │ strategy_matrix  │              │ target_market    │
    │ localization_modes│             │ target_sub_market│
    │ status           │              │ output_storage_key│
    │ actual_cost_usd  │              │ unit_outputs     │
    └──────────────────┘              │ compliance_report_id│
                                      │ confirmation_id  │
                                      │ status           │
                                      └──────────────────┘

独立/辅助表:
  sub_markets, brand_in_configs, brand_us_operations, brand_ng_operations
  compliance_rules, compliance_check_reports, asset_confirmations
  ai_generation_logs, translation_memory_entries, cost_records
  prompt_overrides, system_settings, audit_logs
```

---

## 三、表详细定义

### 3.1 用户与品牌

#### users

用户账户表，支持密码和 SSO 两种认证方式。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| email | VARCHAR(255) | 是 | — | UQ, IDX | 邮箱地址 |
| name | VARCHAR(255) | 是 | — | | 用户名 |
| password_hash | VARCHAR(255) | 否 | — | | 密码哈希 (SSO 用户为 null) |
| primary_role | ENUM(UserRole) | 是 | ad_ops | | 主要角色 |
| is_system_admin | BOOLEAN | 是 | false | | 是否系统管理员 |
| is_active | BOOLEAN | 是 | true | | 是否激活 |
| sso_provider | VARCHAR(50) | 否 | — | | SSO 提供商 (clerk/google) |
| sso_subject | VARCHAR(255) | 否 | — | | SSO 主体 ID |
| external_id | VARCHAR(255) | 否 | — | UQ, IDX | Clerk 外部用户 ID |
| last_login_at | TIMESTAMPTZ | 否 | — | | 最后登录时间 |

---

#### brand_memberships

用户与品牌的多对多关联表。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| user_id | UUID | 是 | — | FK → users.id CASCADE | |
| brand_id | UUID | 是 | — | FK → brands.id CASCADE | |
| role | ENUM(UserRole) | 是 | ad_ops | | 在此品牌中的角色 |

复合唯一约束: `uq_brand_membership (user_id, brand_id)`

---

#### brands

品牌实体，包含语调、限制、术语等配置。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| name | VARCHAR(100) | 是 | — | UQ | 品牌名称 |
| slug | VARCHAR(100) | 是 | — | UQ, IDX | URL 友好标识 |
| display_name_by_market | JSONB | 是 | {} | | 各市场显示名 {"JP": "ブランド名"} |
| restrictions | JSONB | 是 | {} | | 品牌禁忌/限制规则 |
| voice | JSONB | 是 | {} | | 品牌语调定义 |
| lock_brand_name | BOOLEAN | 是 | true | | 是否锁定品牌名不翻译 |
| prompt_additions | VARCHAR(4000) | 是 | "" | | 品牌自定义 Prompt 指令 |
| version | INTEGER | 是 | 1 | | 版本号 (影响 TM 缓存) |
| is_active | BOOLEAN | 是 | true | | 是否激活 |

---

#### glossary_entries

品牌术语表，支持多语言翻译和锁定的创意翻译。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| brand_id | UUID | 是 | — | FK → brands.id CASCADE | |
| source_term | VARCHAR(255) | 是 | — | | 源术语 |
| source_language | VARCHAR(20) | 是 | "en" | | 源语言 |
| category | VARCHAR(50) | 否 | — | | 分类 (产品名/法律/营销) |
| translations | JSONB | 是 | {} | | {"JP": "翻译", "KR": "번역"} |
| locked_transcreations | JSONB | 是 | {} | | 锁定的创意翻译 |
| version | INTEGER | 是 | 1 | | 版本号 |
| approved_by_id | UUID | 否 | — | FK → users.id SET NULL | 审批人 |

复合唯一约束: `uq_glossary_brand_term (brand_id, source_term)`

---

### 3.2 项目与素材

#### projects

项目实体，归属于某个品牌。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| brand_id | UUID | 是 | — | FK → brands.id CASCADE | |
| name | VARCHAR(200) | 是 | — | | 项目名称 |
| description | VARCHAR(2000) | 否 | — | | 项目描述 |
| tags | JSONB | 是 | [] | | 标签列表 |
| is_active | BOOLEAN | 是 | true | | 是否激活 |
| prompt_additions | VARCHAR(4000) | 是 | "" | | 项目级 Prompt 补充 |
| created_by | UUID | 否 | — | FK → users.id SET NULL | 创建人 |

---

#### source_assets

上传的源素材文件记录。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| project_id | UUID | 是 | — | FK → projects.id CASCADE | |
| brand_id | UUID | 是 | — | FK → brands.id CASCADE | |
| uploaded_by | UUID | 否 | — | FK → users.id SET NULL | 上传人 |
| source_type | ENUM(SourceType) | 是 | — | | image/video/text/psd |
| original_filename | VARCHAR(500) | 是 | — | | 原始文件名 |
| storage_key | VARCHAR(1024) | 是 | — | | 存储路径 |
| source_file_hash | VARCHAR(128) | 是 | — | | 文件哈希 (去重) |
| size_bytes | BIGINT | 是 | — | | 文件大小 |
| has_editable_layers | BOOLEAN | 是 | false | | PSD 是否有可编辑图层 |
| file_metadata | JSONB | 是 | {} | | 文件元数据 (尺寸等) |
| tags | JSONB | 是 | [] | | 标签列表 |
| parse_status | ENUM(ParseStatus) | 是 | pending | | pending/running/done/failed |
| parse_error | VARCHAR(4000) | 否 | — | | 解析错误信息 |

---

#### parsed_assets

AI 解析后的素材结构化结果。与 source_assets 1:1 关系。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| source_asset_id | UUID | 是 | — | FK → source_assets.id CASCADE, UQ | 1:1 约束 |
| parse_method | VARCHAR(50) | 是 | — | | vision_llm/frame_extract/nlp/psd_layer |
| parse_model_used | VARCHAR(100) | 否 | — | | 使用的 AI 模型 |
| parse_confidence | NUMERIC(5,3) | 否 | — | | 解析置信度 0.000-1.000 |
| parse_warnings | JSONB | 是 | [] | | 解析警告列表 |
| structural_metadata | JSONB | 是 | {} | | 结构化元数据 |
| parse_duration_ms | INTEGER | 否 | — | | 解析耗时 (毫秒) |
| parsed_at | TIMESTAMPTZ | 否 | — | | 解析完成时间 |

---

### 3.3 本地化单元

#### localizable_units

从素材中提取的可本地化单元 (文本块、视觉元素、音频段)。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| parsed_asset_id | UUID | 是 | — | FK → parsed_assets.id CASCADE, IDX | |
| lu_type | ENUM(LUType) | 是 | — | | text/visual/audio |
| source_content | JSONB | 是 | {} | | 源内容 (文本/图像区域/音频片段) |
| source_location | JSONB | 是 | {} | | 在源素材中的位置 (bbox/时间戳) |
| semantic_role | ENUM(SemanticRole) | 否 | — | | 语义角色 (headline/cta/body/legal) |
| default_strategy | VARCHAR(40) | 否 | — | | 默认处理策略 |
| is_locked | BOOLEAN | 是 | false | | 是否锁定不可编辑 |
| max_length_constraint | INTEGER | 否 | — | | 最大长度约束 (字符数) |
| parser_confidence | NUMERIC(5,3) | 否 | — | | 检测置信度 |
| detection_metadata | JSONB | 是 | {} | | 检测元数据 |

---

#### compliance_units

按市场注入的合规元素 (责任赌博热线、年龄限制声明等)。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| parsed_asset_id | UUID | 是 | — | FK → parsed_assets.id CASCADE, IDX | |
| element_type | ENUM(ComplianceElementType) | 是 | — | | 元素类型 |
| market_content | JSONB | 是 | {} | | 市场特定内容 |
| placement_strategy | VARCHAR(50) | 是 | user_choosable_within_constraints | | 放置策略 |
| user_placement_override | JSONB | 否 | — | | 用户覆盖的放置位置 |

---

### 3.4 任务与产出

#### localization_jobs

本地化任务，一个任务可覆盖多个目标市场。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| source_asset_id | UUID | 是 | — | FK → source_assets.id CASCADE, IDX | |
| requested_by | UUID | 否 | — | FK → users.id SET NULL | 请求人 |
| target_markets | JSONB | 是 | [] | | 目标市场列表 ["JP", "KR"] |
| strategy_matrix | JSONB | 是 | {} | | LU → 策略映射 |
| localization_modes | JSONB | 是 | {language: true, compliance: true, element_replace: true} | | 本地化模式开关 |
| status | ENUM(JobStatus) | 是 | draft | | draft/queued/running/completed/failed |
| started_at | TIMESTAMPTZ | 否 | — | | 开始执行时间 |
| completed_at | TIMESTAMPTZ | 否 | — | | 完成时间 |
| error_message | VARCHAR(4000) | 否 | — | | 错误信息 |
| estimated_cost_usd | NUMERIC(12,4) | 否 | — | | 预估成本 (美元) |
| actual_cost_usd | NUMERIC(12,4) | 否 | — | | 实际成本 (美元) |

**状态机**: `draft → queued → running → completed / failed`

---

#### localized_assets

本地化产出素材，每个目标市场生成一条记录。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| localization_job_id | UUID | 是 | — | FK → localization_jobs.id CASCADE, IDX | |
| source_asset_id | UUID | 是 | — | FK → source_assets.id CASCADE, IDX | |
| target_market | ENUM(Market) | 是 | — | | 目标市场 |
| target_sub_market | VARCHAR(16) | 否 | — | FK → sub_markets.id RESTRICT, IDX | 子市场 (如 US-NJ) |
| output_storage_key | VARCHAR(1024) | 否 | — | | 输出文件存储路径 |
| output_file_hash | VARCHAR(128) | 否 | — | | 输出文件哈希 |
| unit_outputs | JSONB | 是 | [] | | 各 LU 的处理结果 |
| compliance_overlay_applied | BOOLEAN | 是 | false | | 是否已叠加合规元素 |
| compliance_report_id | UUID | 否 | — | FK → compliance_check_reports.id SET NULL | |
| status | ENUM(LocalizedAssetStatus) | 是 | draft | | 状态 |
| confirmation_id | UUID | 否 | — | FK → asset_confirmations.id SET NULL | |
| platform_metadata | JSONB | 是 | {} | | 平台导出元数据 |

**状态机**: `draft → pending → processing → completed → confirmed → distributed / failed`

---

### 3.5 合规体系

#### compliance_rules

系统级合规规则，支持 DSL 触发条件。

| 列名 | 类型 | 必填 | 默认值 | 约束 | 说明 |
|------|------|------|--------|------|------|
| id | UUID | 是 | uuid4 | PK | |
| market | VARCHAR(16) | 是 | — | IDX | 适用市场 (* = 全局) |
| category | ENUM(RuleCategory) | 是 | — | | 规则分类 |
| severity | ENUM(Severity) | 是 | warning | | error/warning/info |
| code | VARCHAR(100) | 是 | — | IDX | 规则代码 (如 RG-001) |
| title | VARCHAR(255) | 是 | — | | 规则标题 |
| message | VARCHAR(2000) | 是 | — | | 检查失败时的消息 |
| suggested_fix | VARCHAR(2000) | 否 | — | | 建议修复方案 |
| trigger | JSONB | 是 | {} | | DSL 触发条件 |
| regulation_reference | VARCHAR(255) | 否 | — | | 法规引用 |
| reference_url | VARCHAR(1024) | 否 | — | | 法规 URL |
| reason_required_by_default | BOOLEAN | 是 | false | | 确认时是否必须填写原因 |
| effective_from | DATE | 否 | — | | 生效日期 |
| effective_to | DATE | 否 | — | | 失效日期 |
| version | INTEGER | 是 | 1 | | 版本号 |
| is_active | BOOLEAN | 是 | true | | 是否激活 |

---

#### brand_rule_overrides

品牌对系统规则的覆盖配置。

| 列名 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| id | UUID | 是 | uuid4 | PK |
| brand_id | UUID | 是 | — | FK → brands.id CASCADE |
| system_rule_id | UUID | 否 | — | FK → compliance_rules.id CASCADE |
| override_type | ENUM(OverrideType) | 是 | — | add/tighten/relax/disable |
| modifications | JSONB | 是 | {} | 修改内容 |
| new_rule_definition | JSONB | 否 | — | 新规则定义 (type=add 时) |
| created_by | UUID | 是 | — | FK → users.id RESTRICT |
| change_reason | VARCHAR(2000) | 是 | — | 变更原因 |
| effective_from / effective_to | DATE | 否 | — | 有效期 |
| is_active | BOOLEAN | 是 | true | 是否激活 |

---

#### compliance_check_reports

合规检查报告 (快照)。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| localized_asset_id | UUID | 是 | 被检查的素材 (非 FK，避免循环) |
| rule_snapshot_version | VARCHAR(100) | 是 | 规则快照版本 |
| overall_status | VARCHAR(40) | 是 | pass/fail/warnings |
| findings | JSONB | 是 | 检查发现列表 |
| ai_vision_checks | JSONB | 是 | AI 视觉检查结果 |
| change_minimization | JSONB | 是 | 变更最小化校验 |
| human_review_required | BOOLEAN | 是 | 是否需要人工审核 |

---

#### asset_confirmations

素材确认记录 (不可变, RESTRICT 删除)。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| localized_asset_id | UUID | 是 | FK → localized_assets.id RESTRICT |
| confirmed_by | UUID | 是 | FK → users.id RESTRICT |
| compliance_report_snapshot | JSONB | 是 | 合规报告快照 |
| effective_rules_snapshot_hash | VARCHAR(128) | 是 | 规则快照哈希 |
| acknowledgments | JSONB | 是 | 确认声明列表 |
| brand_override_state | JSONB | 是 | 品牌覆盖状态快照 |
| comments | JSONB | 是 | 审核意见 |
| ip_address | VARCHAR(64) | 否 | 操作 IP |
| user_agent | VARCHAR(512) | 否 | 浏览器 UA |

---

### 3.6 市场配置

#### sub_markets

子市场配置 (如美国各州、尼日利亚各州)。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | VARCHAR(16) | 是 | PK, 如 "US-NJ" |
| parent_market | ENUM(Market) | 是 | 父市场 |
| handler | ENUM(SubMarketHandler) | 是 | 处理器类型 |
| display_name | VARCHAR(100) | 是 | 显示名称 |
| operational_status | ENUM(OperationalStatus) | 是 | active/pending/blocked |
| min_age | INTEGER | 否 | 最小年龄限制 |
| regulatory_body | VARCHAR(255) | 否 | 监管机构 |
| mandatory_disclaimers | JSONB | 是 | 必须的免责声明 |
| content_language | VARCHAR(20) | 否 | 内容语言 |
| currency | VARCHAR(8) | 否 | 货币代码 |
| prompt_overrides | JSONB | 是 | Prompt 覆盖 |

---

#### brand_us_operations / brand_ng_operations / brand_in_configs

品牌在特定国家的运营配置 (品牌 ID 作为 PK，一品牌一行)。

---

### 3.7 AI 与成本

#### ai_generation_logs

AI 调用日志，记录完整的 Prompt 组装追踪。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| localized_asset_id | UUID | 否 | FK → localized_assets.id SET NULL |
| lu_id | UUID | 否 | FK → localizable_units.id SET NULL |
| use_case | VARCHAR(100) | 是 | text/vision/image_edit/review (IDX) |
| model | ENUM(AIModel) | 是 | AI 模型枚举 |
| provider_model_id | VARCHAR(100) | 否 | 供应商模型标识 |
| assembly_trace | JSONB | 是 | 17 层 Prompt 组装追踪 |
| input_hash | VARCHAR(128) | 是 | 输入哈希 (TM 缓存 key) (IDX) |
| output_text | TEXT | 否 | 文本输出 |
| output_storage_keys | JSONB | 是 | 文件输出路径列表 |
| generation_time_ms | INTEGER | 否 | 生成耗时 (毫秒) |
| cost_usd | NUMERIC(12,6) | 是 | 成本 (美元) |
| tokens_input | INTEGER | 否 | 输入 token 数 |
| tokens_output | INTEGER | 否 | 输出 token 数 |
| verification | JSONB | 是 | 验证结果 |
| status | ENUM(AIStatus) | 是 | success/failure/timeout |
| cache_hit | BOOLEAN | 是 | 是否命中 TM 缓存 |
| cache_key | VARCHAR(128) | 否 | 缓存键 (IDX) |

---

#### translation_memory_entries

翻译记忆库，用于缓存 AI 翻译结果。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| cache_key | VARCHAR(128) | 是 | UQ, IDX — hash(source+use_case+market+brand+glossary_ver) |
| source_text | TEXT | 是 | 源文本 |
| source_language | VARCHAR(20) | 是 | 源语言 |
| target_text | TEXT | 是 | 翻译结果 |
| target_market | VARCHAR(16) | 是 | 目标市场 (IDX) |
| use_case | VARCHAR(100) | 是 | 使用场景 |
| brand_id | UUID | 否 | FK → brands.id SET NULL |
| brand_version | INTEGER | 否 | 品牌版本 (失效判断) |
| glossary_version | INTEGER | 否 | 术语表版本 |
| original_generation_id | UUID | 否 | FK → ai_generation_logs.id SET NULL |
| usage_count | INTEGER | 是 | 使用次数 |
| approved_by_human | BOOLEAN | 是 | 是否经过人工审核 |
| invalidated_at | TIMESTAMPTZ | 否 | 失效时间 |

---

#### cost_records

成本记录，用于账单和报表。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| project_id | UUID | 否 | FK → projects.id SET NULL |
| user_id | UUID | 否 | FK → users.id SET NULL |
| localization_job_id | UUID | 否 | FK → localization_jobs.id SET NULL |
| ai_generation_log_id | UUID | 否 | FK → ai_generation_logs.id SET NULL |
| model | VARCHAR(50) | 是 | 模型名称 |
| use_case | VARCHAR(100) | 是 | 使用场景 |
| cost_usd | NUMERIC(12,6) | 是 | 成本 |
| tokens_used | INTEGER | 否 | token 用量 |
| cache_hit | BOOLEAN | 是 | 是否缓存命中 |
| billing_period | VARCHAR(16) | 是 | 账单周期 (IDX) |

---

### 3.8 系统管理

#### prompt_overrides

管理员可编辑的 Prompt 覆盖，按 use_case × market × mode 维度。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| use_case | VARCHAR(50) | 是 | IDX |
| market | VARCHAR(16) | 是 | IDX, 默认 "" (全局) |
| mode | VARCHAR(32) | 是 | 默认 "" |
| content | VARCHAR(8000) | 是 | Prompt 内容 |
| notes | VARCHAR(500) | 是 | 备注 |
| is_active | BOOLEAN | 是 | true |
| updated_by | UUID | 否 | FK → users.id SET NULL |

复合唯一约束: `uq_prompt_override (use_case, market, mode)`

---

#### system_settings

系统键值配置，支持 DB 行 → 环境变量 fallback 解析。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| key | VARCHAR(100) | 是 | UQ, IDX |
| category | VARCHAR(50) | 是 | secret/public/internal |
| value | TEXT | 是 | 配置值 |
| description | VARCHAR(500) | 否 | 配置说明 |
| updated_by | UUID | 否 | FK → users.id SET NULL |

---

#### audit_logs

审计日志 (追加写入，用于合规追溯)。

| 列名 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | UUID | 是 | PK |
| entity_type | VARCHAR(100) | 是 | IDX — 实体类型 (brand/job/asset) |
| entity_id | UUID | 是 | IDX — 实体 ID |
| action | VARCHAR(50) | 是 | IDX — 操作 (create/update/delete/confirm) |
| actor_id | UUID | 否 | FK → users.id SET NULL |
| changes | JSONB | 是 | 变更内容 {field: {old, new}} |
| ip_address | VARCHAR(64) | 否 | 操作 IP |
| user_agent | VARCHAR(512) | 否 | 浏览器 UA |

---

## 四、迁移历史

| 序号 | 迁移 ID | 描述 | 日期 |
|------|---------|------|------|
| 1 | a252b2b3bb1e | 初始 Schema (全量建表) | 2026-04-20 |
| 2 | e36934ed28e5 | 新增 system_settings 表 | 2026-04-20 |
| 3 | d714e5ac0787 | brands/projects 新增 prompt_additions 字段 | 2026-04-20 |
| 4 | 05796006b779 | localization_jobs 新增 localization_modes 字段 | 2026-04-20 |
| 5 | 3d500478a462 | 新增 prompt_overrides 表 | 2026-04-20 |
| 6 | f8a1c2d3e4f5 | users 新增 external_id 字段 (Clerk 集成) | 2026-04-23 |

**迁移链**: a252b → e3693 → d714e → 05796 → 3d500 → f8a1c (HEAD)

---

## 五、索引策略

### 5.1 主要索引

| 表 | 索引 | 类型 | 说明 |
|------|------|------|------|
| users | ix_users_email | UNIQUE | 邮箱快速查找 |
| users | ix_users_external_id | UNIQUE | Clerk ID 查找 |
| brands | ix_brands_slug | UNIQUE | URL slug 查找 |
| localizable_units | ix_lu_parsed_asset_id | B-TREE | 按解析结果查 LU |
| localization_jobs | ix_jobs_source_asset_id | B-TREE | 按素材查任务 |
| localized_assets | ix_la_job_id | B-TREE | 按任务查产出 |
| localized_assets | ix_la_source_asset_id | B-TREE | 按素材查产出 |
| localized_assets | ix_la_target_sub_market | B-TREE | 按子市场查产出 |
| compliance_rules | ix_cr_market | B-TREE | 按市场筛选规则 |
| compliance_rules | ix_cr_code | B-TREE | 按规则代码查找 |
| ai_generation_logs | ix_agl_use_case | B-TREE | 按场景统计 |
| ai_generation_logs | ix_agl_input_hash | B-TREE | TM 缓存匹配 |
| ai_generation_logs | ix_agl_cache_key | B-TREE | 缓存键查找 |
| audit_logs | ix_al_entity_type | B-TREE | 按实体类型查审计 |
| audit_logs | ix_al_entity_id | B-TREE | 按实体 ID 查审计 |
| audit_logs | ix_al_action | B-TREE | 按操作类型查审计 |

### 5.2 索引建议 (待添加)

| 表 | 建议索引 | 原因 |
|------|----------|------|
| localization_jobs | ix_jobs_status | 按状态筛选任务 (queued/running) |
| localized_assets | ix_la_status | 按状态筛选产出 |
| ai_generation_logs | ix_agl_localized_asset_id | 按产出查 AI 日志 |
| cost_records | ix_cr_user_project | 用户/项目维度成本查询 |

---

## 六、数据安全

### 6.1 外键删除策略

| 策略 | 适用场景 | 示例 |
|------|----------|------|
| CASCADE | 父实体删除时子记录一并删除 | project → source_assets |
| SET NULL | 父实体删除时置空引用 | user → uploaded_by |
| RESTRICT | 禁止删除被引用的实体 | localized_asset → asset_confirmations |

### 6.2 数据保护

| 措施 | 说明 |
|------|------|
| 不可变审计 | audit_logs, asset_confirmations 为追加写入 |
| 合规快照 | compliance_check_reports 保存规则快照，不受后续规则修改影响 |
| 变更日志 | brand_override_change_logs 记录所有规则覆盖的历史变更 |
| 哈希校验 | source_file_hash, output_file_hash 确保文件完整性 |

---

## 附录

### A. 枚举类型

| 枚举 | 值 |
|------|------|
| UserRole | ad_ops, brand_manager, admin |
| SourceType | image, video, text, psd |
| ParseStatus | pending, running, done, failed |
| LUType | text, visual, audio |
| SemanticRole | headline, cta, body, legal, logo, background |
| JobStatus | draft, queued, running, completed, failed |
| LocalizedAssetStatus | draft, pending, processing, completed, confirmed, distributed, failed |
| Market | JP, KR, US, BR, NG, IN, ... |
| RuleCategory | content, legal, branding, cultural |
| Severity | error, warning, info |
| OverrideType | add, tighten, relax, disable |
| AIModel | (多个 AI 模型标识) |
| AIStatus | success, failure, timeout |

### B. 相关文档

- 系统架构: `docs/architecture/01-SYSTEM-ARCHITECTURE.md`
- API 契约: `docs/architecture/02-API-CONTRACTS.md`
- 环境配置: `docs/ENV_GUIDE.md`
