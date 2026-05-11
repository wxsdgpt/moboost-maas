# 可观测性规范

> 日志、监控、文档、反馈闭环。确保系统出了问题能在 5 分钟内定位根因。

---

## 一、结构化日志规范

### 1.1 日志级别

| 级别 | 用途 | 示例 |
|------|------|------|
| `ERROR` | 影响功能的错误，需要立即关注 | 数据库连接失败、API 500 |
| `WARNING` | 异常但不影响功能 | 重试成功、降级生效 |
| `INFO` | 关键业务事件 | 用户登录、Brief 创建、Job 完成 |
| `DEBUG` | 调试信息，生产环境不开 | 请求参数、SQL 语句 |

### 1.2 日志格式 (后端)

```python
import structlog
log = structlog.get_logger()

# 正确: 结构化 key-value
log.info("brief_created", brief_id=brief.id, user_id=user.id, duration_ms=elapsed)
log.error("translation_failed", lu_id=lu.id, error=str(e), model=model_name)

# 错误: 字符串拼接 (不可搜索)
log.info(f"Brief {brief.id} created by user {user.id}")  # 禁止
```

### 1.3 日志格式 (前端)

```typescript
// 统一前缀格式: [模块名] 事件
console.error('[BriefExecute] OpenRouter call failed', { model, error: err.message });
console.info('[Localization] Job submitted', { jobId, markets: targetMarkets });
```

### 1.4 敏感信息脱敏

| 字段 | 脱敏方式 |
|------|----------|
| API Key | 仅显示前8位: `sk-or-v1-abc12345...` |
| 邮箱 | `a***@example.com` |
| 密码 | 永远不记录 |
| JWT Token | 仅记录是否存在: `has_token=true` |
| 用户输入 | 截断至 200 字符 |

---

## 二、关键指标

### 2.1 应用健康指标

| 指标 | 含义 | 告警阈值 | 采集方式 |
|------|------|----------|----------|
| 请求延迟 P95 | 95% 请求在多少 ms 内完成 | > 3000ms | API 中间件 |
| 错误率 | 5xx 响应占比 | > 5% | API 中间件 |
| API 可用性 | 健康检查成功率 | < 99.5% | 冒烟脚本 |
| 数据库连接池 | 活跃连接数 / 最大连接数 | > 80% | DB 监控 |

### 2.2 业务指标

| 指标 | 含义 | 采集方式 |
|------|------|----------|
| Brief 生成成功率 | 成功生成 / 发起次数 | API 日志 |
| Brief 生成耗时 | 从请求到返回的总时间 | API 日志 |
| 图片本地化成功率 | 输出图与源图不同的比例 | Pipeline trace |
| LLM Token 成本 | 每次 AI 调用的 token 用量和费用 | OpenRouter 回调 |
| 用户活跃度 | DAU/WAU/MAU | Clerk + Supabase |

### 2.3 LLM Pipeline 专项

| 采集点 | 记录内容 |
|--------|----------|
| Vision Parser 调用 | 输入图片大小、模型、LU 数量、bbox 数量、耗时、token |
| 翻译调用 | 源文本、目标语言、模型、翻译结果长度、耗时、token |
| 文本叠加 | LU 数量、成功叠加数、失败原因、输出图片大小 |
| 总流程 | Job ID、总耗时、总 token、总成本、最终状态 |

---

## 三、Pipeline Trace 表设计

```sql
CREATE TABLE pipeline_traces (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id      UUID NOT NULL REFERENCES localization_jobs(id),
    step        VARCHAR(50) NOT NULL,  -- 'parse', 'translate', 'overlay', 'review'
    status      VARCHAR(20) NOT NULL,  -- 'started', 'completed', 'failed'
    input_summary   JSONB,             -- 输入摘要 (脱敏后)
    output_summary  JSONB,             -- 输出摘要
    model_used      VARCHAR(100),      -- AI 模型标识
    token_input     INTEGER,
    token_output    INTEGER,
    cost_usd        DECIMAL(10, 6),
    duration_ms     INTEGER,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_traces_job ON pipeline_traces(job_id);
CREATE INDEX idx_traces_step ON pipeline_traces(step);
CREATE INDEX idx_traces_created ON pipeline_traces(created_at);
```

---

## 四、文档管理

### 4.1 文档类型

| 文档 | 位置 | 更新频率 | 责任人 |
|------|------|----------|--------|
| 架构文档 | `docs/architecture/` | 重大变更时 | 技术负责人 |
| API 文档 | FastAPI 自动生成 `/docs` | 随代码更新 | 开发者 |
| 运维手册 | `docs/runbook/` | 每次故障后 | 值班人 |
| 决策日志 | `docs/decisions/` | 每次技术决策 | 决策人 |
| 变更日志 | `CHANGELOG.md` | 每次发布 | 开发者 |

### 4.2 决策日志模板 (ADR)

```markdown
# ADR-[编号]: [决策标题]

**日期**: YYYY-MM-DD
**状态**: 提议/接受/废弃/替代

## 背景
[为什么要做这个决策？]

## 决策
[我们决定...做法是...]

## 备选方案
1. [方案 A] — 未选择原因: ...
2. [方案 B] — 未选择原因: ...

## 后果
- 正面: [...]
- 负面: [...]
- 风险: [...]
```

### 4.3 Postmortem 模板

```markdown
# Postmortem: [事件标题]

**日期**: YYYY-MM-DD
**影响**: [影响范围和持续时间]
**严重程度**: P0/P1/P2

## 时间线
| 时间 | 事件 |
|------|------|
| HH:MM | 问题首次出现 |
| HH:MM | 收到告警/用户报告 |
| HH:MM | 开始排查 |
| HH:MM | 定位根因 |
| HH:MM | 修复上线 |
| HH:MM | 确认恢复 |

## 根因分析
[5 Whys: 为什么发生？为什么没提前发现？]

## 修复措施
- [临时修复]: ...
- [永久修复]: ...

## 改进项
| 改进项 | 类型 | 负责人 | 截止日期 |
|--------|------|--------|----------|
| [改进1] | 预防/检测/响应 | | |
| [改进2] | | | |

## 经验教训
[这次事件教会我们什么？]
```

---

## 五、反馈闭环

### 5.1 数据驱动的迭代流程

```
可观测数据 → 周报分析 → 发现问题/机会 → 进入需求池 → RICE 评估 → 下一迭代
```

### 5.2 周度健康检查 Checklist

| 检查项 | 频率 | 数据来源 |
|--------|------|----------|
| API 错误率趋势 | 每周 | 日志聚合 |
| P95 延迟趋势 | 每周 | 日志聚合 |
| AI 生成成功率 | 每周 | Pipeline traces |
| Token 成本趋势 | 每周 | OpenRouter dashboard |
| 新增 Bug 数量 | 每周 | Bug tracker |
| 用户反馈摘要 | 每周 | 客服/反馈渠道 |
