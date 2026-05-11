# 技术方案: [功能名称]

> 版本: v1.0 | 作者: [姓名] | 日期: YYYY-MM-DD | 关联 PRD: [链接] | 关联设计: [链接]

---

## 一、技术方案概述

### 1.1 方案摘要

[用 2-3 句话描述技术方案的核心思路]

### 1.2 方案评估矩阵

| 评估维度 | 方案 A: [名称] | 方案 B: [名称] | 选定 |
|----------|---------------|---------------|------|
| 复杂度 | 高/中/低 | 高/中/低 | |
| 性能影响 | [描述] | [描述] | |
| 可维护性 | [描述] | [描述] | |
| 改动范围 | [文件数] | [文件数] | |
| 风险 | [描述] | [描述] | |
| 工期估算 | [人·天] | [人·天] | |

**选定方案**: [A/B]，理由: [为什么选这个]

### 1.3 架构影响分析

| 影响范围 | 变更类型 | 说明 |
|----------|----------|------|
| 前端 | 新增/修改/无影响 | [具体说明] |
| 后端 | 新增/修改/无影响 | [具体说明] |
| 数据库 | 新增/修改/无影响 | [是否需要 migration] |
| 第三方 API | 新增/修改/无影响 | [新增依赖说明] |
| 配置 | 新增/修改/无影响 | [新增环境变量] |

---

## 二、前端设计

### 2.1 页面/组件结构

```
src/
├── app/[feature]/
│   ├── page.tsx          # 主页面
│   ├── layout.tsx        # 布局
│   └── components/
│       ├── [Component1].tsx
│       └── [Component2].tsx
├── components/[feature]/
│   └── [SharedComponent].tsx
└── lib/[feature]/
    ├── types.ts          # TypeScript 类型
    ├── api.ts            # API 调用函数
    └── utils.ts          # 工具函数
```

### 2.2 状态管理

| 状态 | 存储位置 | 说明 |
|------|----------|------|
| [状态1] | React state / Context / Supabase | [为什么选这个] |
| [状态2] | | |

### 2.3 API 调用

| 接口 | 方法 | 路径 | 说明 |
|------|------|------|------|
| [接口1] | GET/POST | `/api/[path]` | [描述] |
| [接口2] | | | |

---

## 三、后端设计

### 3.1 API 契约

#### `POST /api/v1/[resource]`

**请求体**:
```json
{
  "field1": "string (required) — 说明",
  "field2": 123,
  "field3": {
    "nested": "object"
  }
}
```

**响应体 (200)**:
```json
{
  "id": "uuid",
  "field1": "string",
  "created_at": "2025-01-01T00:00:00Z"
}
```

**错误响应**:
| HTTP 状态码 | 错误码 | 说明 |
|------------|--------|------|
| 400 | `validation_error` | 请求体校验失败 |
| 401 | `unauthenticated` | 未登录 |
| 403 | `forbidden` | 无权限 |
| 404 | `not_found` | 资源不存在 |
| 500 | `internal_error` | 服务器内部错误 |

### 3.2 服务层设计

```python
# 遵循高内聚原则：每个 service 只负责一个领域
class [Feature]Service:
    """[功能] 的核心业务逻辑"""

    async def create(self, data: CreateSchema) -> Model:
        """创建 — 包含校验、存储、副作用"""
        pass

    async def get_by_id(self, id: UUID) -> Model | None:
        """查询单个"""
        pass

    async def list(self, filters: FilterSchema) -> list[Model]:
        """列表查询 — 支持分页和过滤"""
        pass
```

### 3.3 数据库设计

#### 新增/修改表

```sql
-- 表名: [table_name]
-- 说明: [表的用途]
CREATE TABLE [table_name] (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    [field1]    VARCHAR(255) NOT NULL,
    [field2]    INTEGER DEFAULT 0,
    [field3]    JSONB,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 索引
CREATE INDEX idx_[table]_[field] ON [table_name]([field1]);
```

#### 数据迁移

| 迁移文件 | 操作 | 可回滚 |
|----------|------|--------|
| `xxxx_add_[table].py` | CREATE TABLE | 是 (DROP TABLE) |
| `xxxx_add_[column].py` | ALTER TABLE ADD COLUMN | 是 (DROP COLUMN) |

---

## 四、代码规范

### 4.1 命名规范

| 类别 | 规范 | 示例 |
|------|------|------|
| 文件名 (前端) | kebab-case | `user-profile.tsx` |
| 组件名 (前端) | PascalCase | `UserProfile` |
| 函数名 (前端) | camelCase | `getUserProfile()` |
| 文件名 (后端) | snake_case | `user_profile.py` |
| 类名 (后端) | PascalCase | `UserProfile` |
| 函数名 (后端) | snake_case | `get_user_profile()` |
| API 路径 | kebab-case | `/api/v1/user-profiles` |
| 数据库表名 | snake_case 复数 | `user_profiles` |
| 环境变量 | SCREAMING_SNAKE | `OPENROUTER_API_KEY` |

### 4.2 模块边界规则

```
✓ 允许:
  - 页面 → 调用 lib/api.ts 中的函数
  - lib/api.ts → 调用 Next.js API route
  - API route → 调用 Supabase client
  - API route → 代理到 FastAPI backend

✗ 禁止:
  - 前端组件直接调用 Supabase (绕过 API 层)
  - 后端 service 直接修改另一个 service 的表
  - 组件之间直接导入彼此的内部状态
```

### 4.3 错误处理规范

```typescript
// 前端：统一错误处理
try {
  const result = await api.createBrief(data);
  toast.success('创建成功');
} catch (error) {
  if (error instanceof ApiError) {
    toast.error(error.userMessage);  // 展示给用户的友好信息
    console.error('[createBrief]', error.detail);  // 技术日志
  }
}
```

```python
# 后端：结构化错误
from fastapi import HTTPException
from structlog import get_logger

log = get_logger()

async def create_resource(data):
    try:
        result = await db.insert(data)
        log.info("resource_created", resource_id=result.id)
        return result
    except IntegrityError as e:
        log.warning("duplicate_resource", detail=str(e))
        raise HTTPException(409, detail="Resource already exists")
```

---

## 五、单元测试计划

| 模块 | 测试范围 | 覆盖率目标 | 工具 |
|------|----------|-----------|------|
| 前端组件 | [关键组件列表] | ≥ 80% | Jest + React Testing Library |
| API 路由 | [路由列表] | ≥ 90% | SuperTest / Playwright |
| 后端 Service | [服务列表] | ≥ 85% | pytest + pytest-asyncio |
| 数据库 | Migration 可回滚 | 100% | alembic downgrade |

---

## 六、安全考量

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 输入校验 (前端+后端) | [ ] | [所有用户输入都经过 Pydantic/Zod 校验] |
| SQL 注入防护 | [ ] | [使用 ORM 参数化查询，禁止拼接 SQL] |
| XSS 防护 | [ ] | [React 默认转义，CSP 头已配置] |
| 认证检查 | [ ] | [所有 API 路由都经过 Clerk/JWT 验证] |
| 授权检查 | [ ] | [敏感操作检查用户权限] |
| 敏感数据 | [ ] | [密码哈希、API key 不写入日志] |

---

## 七、技术评审 Checklist

### 进入研发前必须全部通过:

| 检查项 | 通过 |
|--------|------|
| API 契约已定义 (请求/响应/错误码) | [ ] |
| 数据库变更已设计 (含 migration 策略) | [ ] |
| 新增依赖已评估 (必要性、许可证、维护状态) | [ ] |
| 前后端文件结构已规划 | [ ] |
| 高内聚低耦合原则已遵循 (无跨模块直接依赖) | [ ] |
| 错误处理策略已明确 | [ ] |
| 安全检查项已确认 | [ ] |
| 单元测试计划已制定 | [ ] |
| 改动范围与工期估算合理 | [ ] |
| 可回滚方案已准备 (尤其是 DB migration) | [ ] |

---

## 附录

### A. 影响的文件清单

```
src/app/[feature]/page.tsx          (新增)
src/lib/[feature]/api.ts            (新增)
src/app/api/[route]/route.ts        (新增)
services/.../app/api/v1/[route].py  (新增)
services/.../app/models/[model].py  (新增)
alembic/versions/xxxx_[migration].py (新增)
```

### B. 工期估算

| 任务 | 预估 | 实际 |
|------|------|------|
| 前端页面 | [x]天 | |
| 后端 API | [x]天 | |
| 数据库迁移 | [x]天 | |
| 单元测试 | [x]天 | |
| 联调测试 | [x]天 | |
| **合计** | **[x]天** | |
