# 目录布局规范

## 整体结构

```
moboost-maas/
├── src/
│   ├── app/
│   │   ├── (admin)/           # admin 路由组
│   │   ├── (main)/            # 登录用户路由组
│   │   ├── api/               # 所有 API 路由（按模块分目录）
│   │   │   ├── brief/
│   │   │   ├── reports/
│   │   │   ├── landing/
│   │   │   ├── generate-video/
│   │   │   └── admin/
│   │   ├── brief/             # 页面（按模块分）
│   │   ├── report/
│   │   ├── landing/
│   │   ├── admin/
│   │   ├── test/              # 测试页（每个模块一个子目录）
│   │   │   ├── preview/
│   │   │   └── video/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   ├── components/            # 跨模块共享 UI（见 02-ui/components.md）
│   ├── lib/                   # domain + infrastructure
│   │   ├── *Generator.ts      # 业务生成器（landing/report 等）
│   │   ├── *Types.ts          # 对外类型（模块契约）
│   │   ├── *Store.ts          # 状态/持久化封装
│   │   ├── callLLM.ts         # Infra: LLM 统一入口
│   │   ├── openrouter.ts      # Infra: OpenRouter 适配
│   │   ├── db.ts              # Infra: Supabase
│   │   ├── storage.ts         # Infra: Supabase Storage
│   │   ├── auth.ts            # Infra: Clerk 封装
│   │   └── testFixtures/      # 测试 fixture
│   └── middleware.ts          # Clerk + 路由保护
├── docs/                      # 本框架
├── next.config.js             # CSP、rewrites、headers
└── package.json
```

## 命名约定

| 类型 | 示例 | 规则 |
|------|------|------|
| React 组件文件 | `DevicePreviewModal.tsx` | PascalCase |
| Hook | `useLandingFetch.ts` | camelCase + `use` 前缀 |
| Domain 模块 | `landingGenerator.ts` | `<module>` + 动词/名词 |
| 类型模块 | `landingTypes.ts` | `<module>Types` |
| API 路由 | `route.ts` | Next.js 约定 |
| 测试页 | `page.tsx` | Next.js 约定 |

## 模块私有组件

若一个组件**只**被本模块使用，放在模块目录下：

```
src/app/brief/_components/BriefCard.tsx
src/app/report/_components/ReportTab.tsx
```

`_` 前缀使 Next.js 不把它当路由。升级为共享时迁到 `src/components/`。

## 禁止目录

- ❌ `src/utils/`、`src/helpers/`（大杂烩）
- ❌ `src/types/`（类型与使用者必须同目录）
- ❌ `src/hooks/`（hook 与业务同目录，通用 hook 才进 `src/lib/`）

## import 路径

统一使用 `@/` 别名：

```ts
import { generate } from '@/lib/landingGenerator'
import DevicePreviewModal from '@/components/DevicePreviewModal'
```

相对路径仅限于**同目录内**（`./_components/Foo`）。
