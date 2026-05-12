# UnifiedCollector 白盒测试矩阵

## 用户使用路线图

```
首页输入框
    │
    ├─── 路径 A: 直接输入明确 prompt ─────────────────────────────┐
    │    例: "生成一张体育博彩的广告banner"                       │
    │    → /api/intent (confidence≥0.7, intent=asset)             │
    │    → store.createProject + addJob(routing)                  │
    │    → /project/{id} → auto-start → ModelRouter → 生成       │
    │                                                             │
    ├─── 路径 B: 点击 Quick Action + 输入 prompt ────────────────┐
    │    例: 点 "Generate assets" + 输入 "casino bonus banner"    │
    │    → /api/intent (explicitIntent=asset, confidence=1.0)     │
    │    → store.createProject + addJob(routing)                  │
    │    → /project/{id} → auto-start → ModelRouter → 生成       │
    │                                                             │
    ├─── 路径 C: 模糊输入 → 澄清 → 数字快速回复 ───────────────┐
    │    例: "帮我做点东西" → 系统提问 → 用户回复 "2"             │
    │    → 快路径 regex 映射 → intent=asset                       │
    │    → 提取原始 prompt ("帮我做点东西")                       │
    │    C1: 原始有实质内容 → createProject + addJob → 自动生成   │
    │    C2: 原始也是模糊/空 → createProject 无 job → 手动输入    │
    │                                                             │
    ├─── 路径 D: 模糊输入 → 澄清 → 自然语言回复 ───────────────┐
    │    例: "我需要推广材料" → 系统提问 → "我想要图片素材"       │
    │    → 增强 intent API (带上下文) → intent=asset              │
    │    → 同路径 A 执行                                          │
    │                                                             │
    ├─── 路径 E: 只点 Quick Action 不输入 ──────────────────────┐
    │    例: 点 "Generate assets" → 点发送                        │
    │    → /api/intent (explicitIntent=asset, confidence=1.0)     │
    │    → createProject 无 prompt → /project/{id} → 手动输入     │
    │                                                             │
    ├─── 路径 F: 输入含 URL → 需要补充信息 ─────────────────────┐
    │    例: "分析 bet365.com" → intent=intel, needsUrl=false     │
    │    → DB 创建项目 → /project/{id}                            │
    │                                                             │
    └─── 路径 G: 视频类型检测 ──────────────────────────────────┐
         例: "生成一个体育博彩视频" → type=video                  │
         → store.createProject + addJob(type:video, routing)      │
         → /project/{id} → auto-start → VEO3 生成                │
```

## 白盒测试用例

### 1. 意图检测层

| ID | 场景 | 输入 | 预期 intent | 预期 confidence | 通过 |
|----|------|------|-------------|-----------------|------|
| I-01 | 明确 asset 中文 | "生成一张广告banner" | asset | ≥0.7 | 待验 |
| I-02 | 明确 asset 英文 | "create ad creative 1200x628" | asset | ≥0.7 | 待验 |
| I-03 | 明确 video | "生成一个赌场视频广告" | asset (video) | ≥0.7 | 待验 |
| I-04 | 明确 intel | "分析 bet365 的竞品情况" | intel | ≥0.7 | 待验 |
| I-05 | 明确 landing | "生成一个落地页" | landing | ≥0.7 | 待验 |
| I-06 | 明确 pipeline | "一键生成全套营销素材" | pipeline | ≥0.7 | 待验 |
| I-07 | 模糊输入 | "帮我做点东西" | unknown | <0.7 | 待验 |
| I-08 | 空输入+action | selectedAction=asset | asset | 1.0 | ✅ (explicitIntent) |
| I-09 | URL 输入 | "https://bet365.com" | intel | ≥0.5 | 待验 |

### 2. 快路径映射层 (纯函数, 已测试)

| ID | 场景 | 输入 | assistant 含编号 | 预期结果 | 通过 |
|----|------|------|-----------------|---------|------|
| Q-01 | 纯数字 "1" | "1" | 是 | intel | ✅ |
| Q-02 | 纯数字 "2" | "2" | 是 | asset | ✅ |
| Q-03 | 纯数字 "3" | "3" | 是 | landing | ✅ |
| Q-04 | 纯数字 "4" | "4" | 是 | pipeline | ✅ |
| Q-05 | 数字+中文 | "2生成营销素材" | 是 | asset | ✅ |
| Q-06 | 数字+标点 | "2.生成素材" | 是 | asset | ✅ |
| Q-07 | 超范围数字 | "5" | 是 | null (走慢路径) | ✅ |
| Q-08 | 纯文字 | "我想要素材" | 是 | null (走慢路径) | ✅ |
| Q-09 | 无编号上文 | "2" | 否 | null (走慢路径) | ✅ |

### 3. Prompt 提取层 (纯函数, 已测试)

| ID | 场景 | 原始输入 | 回复 | 预期 prompt | 通过 |
|----|------|---------|------|-----------|------|
| P-01 | 有实质原始内容 | "帮我做点东西" | "2" | "帮我做点东西" | ✅ |
| P-02 | 详细原始描述 | "生成体育博彩banner" | "2" | "生成体育博彩banner" | ✅ |
| P-03 | 原始也是数字 | "3" | "2" | "" (空,不自动生成) | ✅ |
| P-04 | 无用户消息 | (无) | "2" | "" (空,不自动生成) | ✅ |

### 4. Asset 类型检测层 (纯函数, 已测试)

| ID | 场景 | 输入 | 预期 type | 通过 |
|----|------|------|----------|------|
| A-01 | 默认 image | "广告banner" | image | ✅ |
| A-02 | 视频关键词 | "体育博彩视频" | video | ✅ |
| A-03 | video 英文 | "casino video ad" | video | ✅ |
| A-04 | animation | "create animation" | video | ✅ |
| A-05 | motion 误匹配修复 | "promotional poster" | image | ✅ |
| A-06 | clip | "short clip" | video | ✅ |
| A-07 | veo | "用veo生成" | video | ✅ |

### 5. 端到端流程 (需人工验收)

| ID | 场景 | 操作步骤 | 预期结果 | 通过 |
|----|------|---------|---------|------|
| E-01 | 直接 asset 生成 | 输入 "生成一张体育博彩banner" → 发送 | 跳转项目页 → ModelRouter → 图片生成 | 待验 |
| E-02 | Quick Action 生成 | 点 "Generate assets" → 输入 "casino bonus" → 发送 | 跳转项目页 → 自动生成 | 待验 |
| E-03 | 澄清→数字回复(有原始内容) | 输入 "帮我做个广告" → 回复 "2" | 跳转项目页 → 用 "帮我做个广告" 生成 | 待验 |
| E-04 | 澄清→数字回复(无原始内容) | 直接 "2" → 提示选项 → 再 "2" | 跳转项目页 → 显示空画布等待输入 | 待验 |
| E-05 | 澄清→自然语言回复 | "我需要推广" → 回复 "图片素材" | intent 检测 → 跳转 → 生成 | 待验 |
| E-06 | 视频生成 | 输入 "生成一个赌场视频" → 发送 | 跳转项目页 → VEO3 提交 → 轮询 | 待验 |
| E-07 | 生成后编辑 | E-01 完成后 → 点击左侧缩略图 | 画布显示 → Edit/Download/Localize 可用 | 待验 |
| E-08 | 项目持久化 | E-01 完成后 → 刷新页面 | 项目在 /project 列表中可见 | 待验 |

## 日志检查点

在上述流程中应可在浏览器 console 看到:
- `[UnifiedCollector] intent detected: {...}` — 意图检测结果
- `[UnifiedCollector] quickReply mapped: asset` — 快路径命中
- `[UnifiedCollector] executeIntent: asset, prompt="..."` — 执行意图
- `[Store] persist project: proj-xxx` — 持久化触发

（待增加 console.log 日志 — 见下一个 commit）
