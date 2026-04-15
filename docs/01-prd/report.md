# PRD：Report 模块（营销报告）

## 1. 模块定位

把 BriefBundle 渲染成**结构化营销报告**，供团队决策；并支持"演化"——在同一 brief 上迭代出多个版本。

**所属业务链路**：Brief → **Report** → 决策 / 演化 / 下游素材

## 2. 目标用户 & 场景

| 角色 | 场景 | JTBD |
|------|------|------|
| 运营 Lead | 向老板汇报方向 | 一页纸看懂方案 |
| 内容团队 | 基于报告分工 | 拿到明确的卖点、人群、竞品差 |

## 3. 用户故事

- 作为运营，我想查看一份含人群画像 / 市场趋势 / 竞品差 / 卖点提案的报告。
- 作为运营，我想对某一条方案点击"演化"，让 LLM 基于新上下文产出 v2。
- 作为运营，我想比较多个报告版本。

## 4. 功能需求

### 4.1 必备
- F1. 从 brief 一键生成 Report（`/api/reports/generate`）。
- F2. 报告包含：人群画像、市场洞察、核心卖点、视觉方向、视频脚本草稿。
- F3. 视频脚本可直接送入 Video 模块生成。
- F4. Spec 校验（`specValidator`）：生成结果必须符合预定义 schema。
- F5. Evolution：基于旧报告 + 新约束生成新版本。

### 4.2 增强
- E1. 报告导出 PDF / Word。
- E2. 报告评分与 A/B 对比。

### 4.3 非目标
- NG1. 不做落地页 HTML（由 Landing 模块）。
- NG2. 不做视频渲染（由 Video 模块）。

## 5. 验收标准

- [ ] AC1. Brief 完整 → Report 成功率 ≥ 95%
- [ ] AC2. 报告 JSON 通过 specValidator（`SpecValidationBadge` 显示 ✓）
- [ ] AC3. "Evolve" 按钮可产出差异化 v2，不是原文复制
- [ ] AC4. 多模型可切换（ModelRouter）

## 6. 关键指标

| 指标 | 目标 |
|------|------|
| 生成耗时 P95 | < 120s |
| Spec 校验通过率 | ≥ 98% |
| 演化采纳率 | ≥ 30% |

## 7. 依赖 & 约束

- 依赖：Brief 模块产出、`reportGenerator`、`callLLM`、`specValidator`
- 成本：单次 < 60k tokens

## 8. 风险

| 风险 | 应对 |
|------|------|
| LLM 输出不合 schema | specValidator 失败自动 retry，超 2 次降级简化 schema |
| 长报告加载慢 | 分段流式渲染（后续迭代） |

## 9. 迭代日志

### v1.0
- 初版：F1–F4 上线，含 Evolution
