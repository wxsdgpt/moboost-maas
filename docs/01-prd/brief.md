# PRD：Brief 模块（营销简报）

## 1. 模块定位

把用户一句话需求（如"我要给 30 岁男性体育粉做一个博彩落地页"）转化为**结构化营销简报**，作为后续 Report / Landing / Video 生成的统一输入。

**所属业务链路**：用户输入 → **Brief** → Report / Landing / Video

## 2. 目标用户 & 场景

| 角色 | 场景 | JTBD |
|------|------|------|
| 营销运营 | 给新项目做初版方案 | 省去查市场、写简报的 2–3 小时 |
| 内容策划 | 为多平台批量出物料 | 统一一份简报驱动多种产物 |

## 3. 用户故事

- 作为运营，我想输入一句话描述产品与受众，得到一份包含市场洞察、人群画像、核心卖点的 JSON 简报。
- 作为运营，我想看到简报的生成过程（思考 / 搜索 / 信源评估），以便信任结果。
- 作为运营，我想编辑简报字段后再进入下一步。

## 4. 功能需求

### 4.1 必备
- F1. **意图识别**：解析一句话，输出 `{ product, audience, goal, region }` 结构。
- F2. **事实收集（Unified Collector）**：调用搜索 + LLM，输出带信源的事实列表。
- F3. **专家搜索（Expert Search）**：针对 iGaming 场景补充法规、竞品、红线词。
- F4. **思考过程可见**：`ThinkingPanel` 实时展示 LLM 推理步骤。
- F5. **输出 BriefBundle**：一份完整的 JSON，含 intent / facts / audience / positioning。

### 4.2 增强
- E1. 简报可编辑（表单回填）。
- E2. 历史简报重用。

### 4.3 非目标
- NG1. 不做营销内容本身的生成（由 Report/Landing 模块负责）。
- NG2. 不做多语言翻译（后置到内容层）。

## 5. 验收标准

- [ ] AC1. 输入合法一句话，≤ 60s 返回 BriefBundle（F1–F5）
- [ ] AC2. 每条 fact 附 source URL + trust score（F2）
- [ ] AC3. 信源可信度 < 阈值时在 UI 标红（F2 + UI）
- [ ] AC4. LLM 调用失败有 retry + 降级模型

## 6. 关键指标

| 指标 | 目标 |
|------|------|
| 简报首次生成耗时 | P95 < 90s |
| 事实信源可信度均值 | ≥ 0.7（`sourceQuality` 打分） |
| 用户编辑率 | < 30%（越低代表首版越准） |

## 7. 依赖 & 约束

- 依赖：`callLLM`, `sourceSearch`, `trustedSources`, `sourceQuality`
- 成本约束：单次简报 LLM token < 30k

## 8. 风险

| 风险 | 应对 |
|------|------|
| 搜索返回垃圾站 | `trustedSources` 白名单 + `sourceQuality` 打分 |
| LLM 幻觉事实 | 所有 fact 必须带 source，前端标记"未验证" |

## 9. 迭代日志

### v1.0 — 2026-03
- 初版：F1–F5 全部上线
### v1.1 — 2026-04
- 加入 Expert Search 专家流
