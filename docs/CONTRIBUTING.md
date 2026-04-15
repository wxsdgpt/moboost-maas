# 贡献流程

> 任何功能迭代都按本流程走完一圈，PR 描述里勾选每个阶段。

## 总流程

```
PRD 立项 ──→ UI 设计 ──→ Dev 实现 ──→ Test 验收 ──→ Merge
   │           │           │           │
   01-prd      02-ui       03-dev      04-test
```

每一阶段都更新对应文档（不只是写代码）。

## 1. PRD 阶段

写在 `docs/01-prd/<module>.md` 的"迭代日志"末尾：

- [ ] 用户故事 / 验收标准 / 非目标
- [ ] 与既有 PRD 一致性（不冲突）
- [ ] 关键指标可测量

## 2. UI 阶段

更新 `docs/02-ui/<module>-ui.md`：

- [ ] 信息架构 wireframe（或 Figma 链接）
- [ ] 所有状态：Empty / Loading / Error / Success
- [ ] 颜色/字号引用 design tokens（不硬编码）
- [ ] 列出新增或复用的组件
- [ ] a11y 检查项

## 3. Dev 阶段

更新 `docs/03-dev/<module>-dev.md`：

- [ ] API 契约登记到 `<module>Types.ts`
- [ ] 模块归属符合 [directory-layout.md](./03-dev/directory-layout.md)
- [ ] 没有跨模块直 import（见 [principles.md](./00-architecture/principles.md)）
- [ ] 关键技术决策有注释
- [ ] 环境变量已记录

## 4. Test 阶段

更新 `docs/04-test/<module>-test.md`：

- [ ] 新增单元 / 集成 / 视觉用例
- [ ] 已修 bug 加进"历史 bug 回归"表
- [ ] `/test/<module>` 测试页能复现 + 验证
- [ ] `moboost-test` skill 通过率不下降

## PR Checklist 模板

```markdown
## 变更类型
- [ ] feat / fix / refactor / docs / test

## 模块
- [ ] Brief / Report / Landing / Video / Admin / Shared

## 文档同步
- [ ] PRD 已更新（docs/01-prd/<module>.md）
- [ ] UI 已更新（docs/02-ui/<module>-ui.md）
- [ ] Dev 已更新（docs/03-dev/<module>-dev.md）
- [ ] Test 已更新（docs/04-test/<module>-test.md）

## 验证
- [ ] `npm run build` 通过
- [ ] `npx tsc --noEmit` 无新增错误
- [ ] /test/<module> 视觉验收通过
- [ ] 关联 issue/bug 编号：#…
```

## Code Review 关注点

- ✅ 模块边界：是否破坏高内聚低耦合？
- ✅ 类型契约：API 类型是否声明在 `<module>Types.ts`？
- ✅ 安全：鉴权 / 输入校验 / 敏感日志？
- ✅ 文档：四层是否都同步？
- ✅ 测试：bug 修复有对应回归用例？

## 发版前 Checklist

见 [`04-test/strategy.md` 回归测试 checklist](./04-test/strategy.md)。
