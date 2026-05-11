# Moboost MAAS 系统健康评估报告

> 版本: v1.0 | 日期: 2026-04-24 | 评估人: Claude AI | 状态: 已完成

---

## 一、评估概要

### 1.1 总体评分

| 维度 | 评分 | 等级 | 说明 |
|------|------|------|------|
| 安全性 | 7/10 | 良好 | ORM 防注入、TS strict、CSP 头完整；存在密钥管理风险 |
| 测试覆盖 | 3/10 | 不足 | 后端有 5 个测试文件；前端零测试 |
| 代码质量 | 8/10 | 优秀 | 类型严格、模块化、命名一致 |
| 架构设计 | 8/10 | 优秀 | 清晰分层、高内聚低耦合、可审计 Pipeline |
| 可维护性 | 7/10 | 良好 | 文档齐全；部分环境变量未文档化 |
| 可观测性 | 6/10 | 一般 | structlog 已接入、AI 日志完整；缺少前端日志聚合 |
| 性能 | 7/10 | 良好 | 异步 IO、连接池、TM 缓存；缺少速率限制 |
| **综合** | **6.6/10** | **良好** | 架构扎实，测试是最大短板 |

### 1.2 风险矩阵

```
高影响 │  ● 前端零测试覆盖        ▲ .env.local 密钥
       │  ● 缺少速率限制
       │
中影响 │  ○ 16个未文档化环境变量    ○ 空 catch 块
       │  ○ Playwright 误入生产依赖
       │
低影响 │  △ lucide-react 版本滞后  △ 双数据库模式
       │
       └──────────────────────────────────────────
          低概率              中概率             高概率
```

图例: ● 严重 | ○ 中等 | △ 低风险 | ▲ 紧急

---

## 二、详细评估

### 2.1 安全性

#### 2.1.1 发现项

| 编号 | 严重程度 | 发现 | 位置 | 建议 |
|------|----------|------|------|------|
| SEC-001 | 紧急 | `.env.local` 包含真实 API 密钥 (OpenRouter `sk-or-v1-*`, Clerk `sk_test_*`) | `.env.local` | 确认未提交到 Git；已提交则立即轮转密钥 |
| SEC-002 | 低 | 仅一处 `dangerouslySetInnerHTML`，用于静态 CSS 注入 | `src/app/layout.tsx` | 安全，无需处理 |
| SEC-003 | 低 | 所有 SQL 操作使用 ORM 参数化查询 | 全后端 | 维持现状 |

#### 2.1.2 安全防护现状

| 防护措施 | 状态 | 说明 |
|----------|------|------|
| SQL 注入防护 | 已实施 | SQLAlchemy ORM，无原始 SQL 拼接 |
| XSS 防护 | 已实施 | React 默认转义 + CSP 头 |
| CSRF 防护 | 部分实施 | Clerk Session 含 CSRF Token |
| 认证 | 已实施 | Clerk (前端) + JWT (后端) + Service Token (代理) |
| 授权 | 已实施 | RBAC 基于 brand_memberships |
| 安全响应头 | 已实施 | X-Frame-Options, X-Content-Type-Options, CSP |
| 密钥管理 | 需改进 | 环境变量注入，但 .env.local 存在风险 |
| 速率限制 | 未实施 | API 无 rate limiting |
| 输入校验 | 已实施 | Pydantic (后端) + 前端校验 |
| 日志脱敏 | 已实施 | API key 截断、密码不记录 |

---

### 2.2 测试覆盖

#### 2.2.1 当前状态

| 层级 | 文件数 | 覆盖范围 | 目标 | 差距 |
|------|--------|----------|------|------|
| 前端单元测试 | 0 | 0% | ≥ 80% | 需新建 |
| 前端 E2E | 0 | 0% | 关键路径 100% | 需新建 |
| 后端单元测试 | 5 | ~15% | ≥ 80% | 大量补充 |
| 后端集成测试 | 0 | 0% | ≥ 70% | 需新建 |
| 冒烟测试 | 1 (脚本) | 部分 | 100% | 需完善 |

#### 2.2.2 已有后端测试

| 测试文件 | 覆盖模块 | 说明 |
|----------|----------|------|
| test_health.py | /v1/health | 健康检查端点 |
| test_rule_engine.py | compliance_check | 合规规则引擎 |
| test_prompt_assembly.py | prompt_assembler | Prompt 组装 |
| test_strategy_resolver.py | strategy_resolver | 策略解析 |
| test_seed_payload.py | seed 数据 | 种子数据校验 |

#### 2.2.3 优先补充建议

| 优先级 | 测试范围 | 工作量 | 价值 |
|--------|----------|--------|------|
| P0 | orchestrator.py 单元测试 | 2 天 | 覆盖核心业务逻辑 |
| P0 | Brief API Routes (/api/brief/*) | 3 天 | 用户最频繁使用的功能 |
| P1 | localize_text + visual_edit 单元测试 | 2 天 | AI 管线核心 |
| P1 | 前端关键路径 E2E (Playwright) | 3 天 | 登录→创建项目→生成 Brief |
| P2 | API 契约测试 (前端→后端代理) | 2 天 | 确保代理转发正确 |
| P2 | compliance_check 集成测试 | 1 天 | 已有基础，扩展覆盖 |

---

### 2.3 代码质量

#### 2.3.1 类型安全

| 维度 | 状态 | 说明 |
|------|------|------|
| TypeScript strict mode | 已开启 | tsconfig.json `strict: true` |
| Python 类型注解 | 完整 | 所有函数签名含类型注解 |
| Pydantic 校验 | 已使用 | 所有 API 输入经 Schema 校验 |
| Mypy 静态检查 | 已配置 | `mypy>=1.12` 在 dev 依赖中 |
| Ruff Linting | 已配置 | pyproject.toml 含 ruff 配置 |

#### 2.3.2 代码异味

| 编号 | 严重程度 | 发现 | 位置 | 建议 |
|------|----------|------|------|------|
| CQ-001 | 中 | 7 个空 catch 块静默吞没错误 | admin/intelligence, admin/mutations, reset, AdminMutationBanner | 至少添加 console.error |
| CQ-002 | 低 | ENRICH_MODEL vs ENRICHMENT_MODEL 重复环境变量 | src/lib/ | 统一为一个变量名 |
| CQ-003 | 中 | Playwright (^1.59) 作为生产依赖而非 devDependency | package.json | 移至 devDependencies |
| CQ-004 | 低 | lucide-react 版本滞后 (0.383 vs 最新 0.460+) | package.json | 更新到最新 |

---

### 2.4 架构健康

#### 2.4.1 优势

| 方面 | 说明 |
|------|------|
| 分层清晰 | 前端 (BFF) → 后端 (Service) → 数据库，职责分明 |
| 高内聚 | 每个 service 单一职责 (parse/translate/compose/compliance) |
| 低耦合 | 模块间通过 orchestrator 协调，不直接依赖 |
| 可审计 | AI 调用全链路追踪 (17 层 assembly_trace) |
| 合规就绪 | 不可变确认记录、规则快照、审计日志 |
| 翻译记忆 | TM 缓存减少重复 AI 调用和成本 |

#### 2.4.2 技术债务

| 编号 | 严重程度 | 债务描述 | 影响 | 偿还建议 |
|------|----------|----------|------|----------|
| TD-001 | 高 | 双数据库模式 — 前端 Supabase 直连 + 后端 SQLAlchemy 操作同一库 | Schema 同步风险、数据一致性 | 写操作逐步收敛到后端 API |
| TD-002 | 高 | 前后端类型不共享 | 联调成本高、运行时类型不匹配 | 引入 OpenAPI 自动生成 TS 类型 |
| TD-003 | 中 | 缺少 API Gateway / 速率限制 | 被滥用、DDoS 风险 | 接入 Cloudflare / API Gateway |
| TD-004 | 中 | 前端 API Routes 既做 BFF 又做代理 | 职责不清晰 | 明确 BFF 边界，纯代理走 middleware |
| TD-005 | 低 | 前端状态持久化到磁盘 (/api/store) | 不适合多实例部署 | 迁移到数据库 |

---

### 2.5 可观测性

| 维度 | 状态 | 说明 |
|------|------|------|
| 后端结构化日志 | 已实施 | structlog JSON 格式 |
| 前端日志 | 部分实施 | console.* + [模块名] 前缀，无聚合 |
| AI 调用追踪 | 已实施 | ai_generation_logs 含完整 assembly_trace |
| 成本追踪 | 已实施 | cost_records 按 billing_period |
| 健康检查 | 已实施 | /health (前端) + /v1/health (后端) |
| 告警 | 未实施 | 无自动告警机制 |
| APM | 未实施 | 无应用性能监控 |
| 前端错误追踪 | 未实施 | 无 Sentry 等错误追踪服务 |

---

### 2.6 依赖健康

#### 2.6.1 前端关键依赖

| 依赖 | 版本 | 状态 | 风险 |
|------|------|------|------|
| next | ^14.2 | 当前代 | 低 |
| react | ^18.3 | 当前代 | 低 |
| @clerk/nextjs | ^6.12 | 当前代 | 低 |
| @supabase/supabase-js | ^2.45 | 当前代 | 低 |
| openai | ^4.50 | 当前代 | 低 |
| tailwindcss | ^3.4 | 当前代 | 低 (v4 已发布) |
| playwright | ^1.59 | 误入 dependencies | 中 — 应为 devDependencies |
| three | ^0.163 | 略旧 | 低 |

#### 2.6.2 后端关键依赖

| 依赖 | 版本 | 状态 | 风险 |
|------|------|------|------|
| fastapi | >=0.115 | 最新 | 低 |
| sqlalchemy[asyncio] | >=2.0 | 最新代 | 低 |
| pydantic | >=2.9 | 最新代 | 低 |
| procrastinate | >=3.0 | 活跃维护 | 低 |
| httpx | >=0.27 | 最新 | 低 |
| structlog | >=24.4 | 最新 | 低 |

---

### 2.7 配置管理

#### 2.7.1 未文档化的环境变量

以下 16 个环境变量在代码中使用但未出现在 `.env.example`:

| 变量名 | 使用位置 | 影响 |
|--------|----------|------|
| CRON_SECRET | /api/cron/* | Cron 任务鉴权 |
| AGENT_MODEL | callLLM.ts | AI Agent 模型 |
| CLARIFY_MODEL | brief/clarify | Brief 澄清模型 |
| ENRICHMENT_MODEL / ENRICH_MODEL | 数据丰富 | 重复命名 |
| EVOLUTION_MODEL | evolution | 迭代模型 |
| LANDING_MODEL | landing/generate | 落地页模型 |
| PARSE_MODEL | brief/parse | Brief 解析模型 |
| REPORT_MODEL | reports/generate | 报告模型 |
| META_AGENT_MODEL | brief/agent | 元代理模型 |
| INSIGHTRACKR_API_KEY | marketIntel/ | 市场情报 API |
| INSIGHTRACKR_API_BASE_URL | marketIntel/ | 市场情报 API |
| SIMILARWEB_API_KEY | marketIntel/ | SimilarWeb API |
| META_AD_LIBRARY_TOKEN | marketIntel/ | Meta 广告库 |
| MAX_UPLOAD_BYTES | upload | 上传限制 |
| VIDEO_GENERATE_AUDIO | generate-video | 视频音频开关 |

---

## 三、改进路线图

### 3.1 紧急 (本周)

| 编号 | 行动 | 负责 | 预估 |
|------|------|------|------|
| A-001 | 确认 .env.local 未提交 Git；若已提交则轮转所有密钥 | 运维 | 1h |
| A-002 | 将 Playwright 从 dependencies 移至 devDependencies | 前端 | 5min |
| A-003 | 修复 7 个空 catch 块，添加 console.error | 前端 | 30min |

### 3.2 短期 (2 周内)

| 编号 | 行动 | 负责 | 预估 |
|------|------|------|------|
| B-001 | 补充 16 个未文档化环境变量到 .env.example | 全栈 | 2h |
| B-002 | orchestrator.py 单元测试 | 后端 | 2d |
| B-003 | Brief API Routes 集成测试 | 前端 | 3d |
| B-004 | 接入前端错误追踪 (Sentry) | 前端 | 1d |

### 3.3 中期 (1 月内)

| 编号 | 行动 | 负责 | 预估 |
|------|------|------|------|
| C-001 | 前端关键路径 E2E (Playwright) | QA | 3d |
| C-002 | API 速率限制 | 后端 | 2d |
| C-003 | 前后端类型共享 (OpenAPI → TS) | 全栈 | 3d |
| C-004 | 统一 ENRICH_MODEL/ENRICHMENT_MODEL | 前端 | 1h |

### 3.4 长期 (季度)

| 编号 | 行动 | 负责 | 预估 |
|------|------|------|------|
| D-001 | 写操作收敛到后端 (消除双数据库模式) | 架构 | 2w |
| D-002 | CI/CD Pipeline (GitHub Actions) | DevOps | 1w |
| D-003 | APM 接入 (DataDog / New Relic) | 运维 | 1w |
| D-004 | 前端测试覆盖率达到 ≥ 80% | 前端 | 4w |

---

## 附录

### A. 评估方法

| 维度 | 方法 |
|------|------|
| 测试覆盖 | 文件搜索 (*.test.*, __tests__, tests/) |
| 安全性 | 关键字搜索 (sk-, key=, dangerouslySetInnerHTML, raw SQL) |
| 代码质量 | 模式搜索 (空 catch、重复导入、类型配置) |
| 架构 | 目录结构分析、依赖关系追踪 |
| 可观测性 | 日志框架、监控配置、健康检查端点检查 |

### B. 相关文档

- 系统架构: `docs/architecture/01-SYSTEM-ARCHITECTURE.md`
- API 契约: `docs/architecture/02-API-CONTRACTS.md`
- 数据库 Schema: `docs/architecture/03-DATABASE-SCHEMA.md`
- 测试规范: `docs/process/04-TEST-SYSTEM.md`
- 可观测性规范: `docs/process/05-OBSERVABILITY.md`
