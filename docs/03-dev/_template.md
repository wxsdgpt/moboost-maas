# Dev 模板：<模块名>

## 1. 目录归属

```
src/app/<module>/          # 页面
src/app/api/<module>/      # API 路由
src/lib/<module>*.ts       # domain 逻辑 + 类型
src/app/test/<module>/     # 测试页
```

## 2. 对外接口（契约）

### API 端点

| Method | Path | Request | Response | 鉴权 |
|--------|------|---------|----------|------|
| POST | `/api/<module>/action` | `RequestType` | `ResponseType` | Clerk |

### 类型定义

全部声明在 `src/lib/<module>Types.ts`，前端、API、domain 共用。

```ts
export type RequestType = { ... }
export type ResponseType = { ... }
```

## 3. 文件清单

| 文件 | 职责 |
|------|------|
| `<module>Generator.ts` | 主业务流，纯函数 |
| `<module>Types.ts` | 对外类型 |
| `<module>Templates.ts` | 静态模板 |

## 4. 关键技术决策

- 为什么选 X 而不是 Y：…
- 性能权衡：…
- 安全考虑：…

## 5. 环境变量

| 变量 | 用途 | 默认值 |
|------|------|--------|

## 6. 错误处理

- 错误类型 → HTTP code 映射
- 哪些错误要重试

## 7. 变更记录
