# Claude Code 启动说明

## 如何使用本文档包

本目录包含 iGaming 广告素材**本地化**系统的完整设计文档。这是一个本地化工具，不是创意生成工具。

### 必读文件顺序

1. **`CLAUDE.md`**（放在项目根目录）：Claude Code 自动识别的入口
2. **`CLAUDE_CODE_GUIDE.md`**（本文件）：开发顺序和约束
3. **`PROJECT.md`**：项目定位和原则
4. **`UI_LANGUAGE_SPEC.md`**：UI 全英文 + 多语言内容规则
5. **`LOCALIZABLE_UNITS.md`**：核心概念，整个产品的灵魂
6. **`SUB_MARKETS.md`**：美国按州、印度按邦的子市场模型（两者完全不同）
7. **`MVP_SCOPE.md`**：V1 范围
8. **`ARCHITECTURE.md`**：系统分层和流水线
9. **`PROMPT_ASSEMBLY.md`**：统一分层 Prompt 拼接
10. **`COMPLIANCE_GOVERNANCE.md`**：合规规则管理 + override 模型 + 审核工作流
11. **`DATA_MODELS.md`**：数据结构
12. **`COMPLIANCE_RULES.md`**：8 市场规则
13. **`BRAND_AND_GLOSSARY.md`**：简化版品牌和术语

## 核心产品理解

**这不是"AI 生成广告素材"工具**。

用户场景：
1. 营销团队已经有成品广告素材（PSD、图片、视频）
2. 需要把素材本地化到 7 个市场
3. 每个可本地化的元素（文字、人物、配音）都可以选择不同的处理策略
4. 系统执行用户选择，保真度第一，只改该改的

AI 的作用：
- Nano Banana：**编辑**扁平化图片的局部（文字替换、元素替换）
- Veo 3.1：**编辑**视频（配音替换、画面文字）
- LLM：**翻译**或**创译**文字、**解析**源素材
- 多模态 LLM：**理解**源素材（取代 OCR）

AI 不做的：
- 不从 brief 生成新素材
- 不做创意构思
- 不改用户没授权的地方

## 关键概念

### Localizable Unit (LU)

源素材会被解析成多个 LU。每个 LU 用户可选一个 localization strategy。

- **Text LU**: CTA、法律、标题等文字片段
- **Visual LU**: 人物、场景、道具
- **Audio LU**: 对话、音效、音乐（视频）
- **Compliance LU**: 自动注入，用户不可选

### Strategy

- **Text**: keep / literal / light / transcreate / user_provided
- **Visual**: keep / replace_for_compliance / localize_culturally / custom_replace
- **Audio**: keep / subtitles_only / replace_dialogue / with_subtitles

### Change Minimization

AI 编辑必须保真：只改被指定的区域，其他区域与源素材位对齐。
用 perceptual hash 验证。

## 建议的开发顺序

### Phase 1: Scaffolding（2 周）
- FastAPI 后端 + Next.js 前端
- PostgreSQL + Redis + S3
- i18n 框架（next-intl）
- 认证 + RBAC
- Docker Compose 本地环境
- CI/CD 基础

### Phase 2: Source Parsing + LU System（3-4 周）
- 源素材上传
- PSD 解析器（psd-tools）
- 多模态 LLM 图片解析
- 视频解析（帧分析 + 音频转录）
- LU 数据模型
- Default Strategy Resolver
- Strategy Matrix UI（核心交互）

### Phase 3: AI Integration + Prompt Assembly（3-4 周）
- Prompt Assembly 服务（Layer 抽象 + Layer 库）
- 9 个 Use Case 实现
- Nano Banana 集成（文字替换、元素替换）
- Veo 3.1 集成（音频替换、视频文字）
- LLM 翻译/创译
- PSD 文字图层替换（确定性路径）
- Change Minimization Verification
- 翻译记忆缓存

### Phase 4: Compliance + Confirmation Workflow（3-4 周）
- 规则引擎 DSL（两层：系统默认 + 品牌 override）
- 8 市场系统默认规则库初始化（US/UK/PH/IN/BR/FR/DE/NG）
- 品牌 Override 管理 UI 和权限
- 违禁词检测 + 强制元素检查
- 合规元素确定性叠加（Pillow / FFmpeg）
- 视觉 AI 合规检查
- **全警告模式**（不硬拦截）
- Critical/Warning/Info 严重程度分级
- 单阶段确认工作流（替代原多级审批）
- Reason 输入和强制留痕
- AssetConfirmation 不可变记录
- 系统管理员跨品牌仪表板
- 审计日志 + 合规报告 + 监管审计包导出

### Phase 5: Export + Deploy（2-3 周）
- Meta/Google/DSP 格式适配
- 成本追踪
- 监控 + 日志
- 法务验收测试
- 生产部署

## 关键实现提醒

### 必须做对的

1. **Source Anchor Layer 是灵魂**
   - 每个 AI 编辑 use case 必须应用这个 Layer
   - 告诉 AI 什么不能改
   - 后端用 perceptual hash 自动验证

2. **PSD 优先路径**
   - 有图层就不用 AI
   - 成本和质量都更好
   - AI 只是 fallback

3. **合规元素不用 AI 生成**
   - RG logo、警语、牌照号用 Pillow/FFmpeg 确定性渲染
   - 审计才能通过

4. **合规是建议，不是拦截**
   - 所有发现都以警告形式展示
   - 系统永远不阻止用户提交
   - 但必须有完整审计链路，证明"用户看到了什么、如何决策"

5. **两层规则模型**
   - 系统默认规则（代码维护）+ 品牌 override（管理员维护）
   - 品牌 override 可加严也可放宽（完全控制）
   - 但所有变更必须留痕且通知相关方

6. **强制确认机制**
   - 即使零违规，Ad Ops 也必须点击确认
   - 这个确认是法律意义的"责任签字"
   - 记录到 AssetConfirmation 不可变表

7. **所有 AI 调用全量日志**
   - AIGenerationLog 是合规审计的核心
   - 包含完整 Prompt Assembly trace
   - 必须可复现

8. **规则版本化 + 快照**
   - 素材确认时快照当前的"系统默认 + 品牌 override"组合
   - 新规则不影响历史

9. **异步任务设计**
   - Veo 视频编辑慢且贵
   - 必须用队列 + 状态管理

10. **德国特殊处理**
    - 时段元数据（21:00-06:00）
    - 赔率具体数字检测
    - Audio 层注入 calm tone

### 容易踩的坑

1. **不要把 Localization Job 做成 Creative Brief**
   - UI 核心是 Strategy Matrix，不是 prompt 输入框
   - 用户描述"我想要什么样的广告"是错误方向

2. **PSD 解析不要只做文字层**
   - 图像层、智能对象、图层效果都要保留
   - 重组时要能还原原 PSD 的所有结构

3. **Change Minimization 要严格**
   - AI 经常"顺手"改其他地方
   - 必须有自动验证兜底
   - 验证失败要 retry 或人工介入

4. **巴西葡语 ≠ 葡萄牙葡语**
   - 所有翻译用 pt-BR
   - TM 缓存 key 包含 market

5. **美国不是一个市场**
   - ~38 个合法州各自独立，每州有独立规则包
   - 每个州生成独立 LocalizedAsset
   - CA、TX、UT、HI 等禁投州必须在元数据层保护
   - **V1 全 38 州覆盖**：架构和数据 Day 1 就位；规则包内容按 Tier 推进（NJ/PA/NY/MI/IL/MA/OH/CO 优先）

6. **尼日利亚结构上跟美国一样**
   - 2024 年 11 月最高法院裁决后，监管下放到州，NLRC 仅管 FCT
   - 使用与 US 相同的 `PER_STATE_OPERATING` handler，只是换一张 sub-market 表
   - V1 优先做 NG-LA（Lagos / LSLGA）和 NG-FCT（联邦首都区 / NLRC）
   - 其他州 data model 预留，规则包 minimal
   - 内容语言：English（`en-NG`），货币 NGN
   - 足球是主导运动（Premier League、AFCON），内容语境跟 UK/BR 有共性

7. **印度和美国/尼日利亚完全不同**
   - 印度是一套素材 + 邦级 blocklist 分发时应用
   - 不是每个邦独立生成
   - Karnataka 法律状态易变，默认 blocked

8. **Veo 3.1 时长处理（2026 能力更新）**
   - 原生 4/6/8 秒 + Video Extend API 可达 148 秒
   - Google API 自动合并原始和扩展片段，**不需要自己拼接**
   - 音画同步由 Google 内部处理
   - 30 秒内素材质量稳定；60 秒以上注意质量衰减（>4-5 次 extend）
   - 成本随 extend 次数累积（30 秒约 8 秒的 5 倍）
   - 风险：Extend 可能仅在 Vertex AI Preview 可用，评估生产环境依赖
   - Extend 输入约束：720p、MP4、24fps

9. **多模态 LLM 小字识别率**
   - 法律警语常常是小字
   - 验收测试重点项
   - 如果不行准备 OCR backup

10. **子市场法律状态会变**
    - 美国会有新州合法化（系统管理员可维护）
    - 尼日利亚各州监管框架仍在成形，需定期追踪
    - 印度 Karnataka 等邦反复
    - 需要 last_reviewed_at 字段提醒定期检查

## 沟通建议

以下情况先与产品确认（V1 没有法务角色，但重大变更仍需产品确认）：

- 新增或修改**系统默认**合规规则（品牌 override 是用户自服务）
- 改动 LU 分类或策略
- 新增市场或语言支持
- 改动审核/确认工作流
- AI 调用默认参数变更
- PSD 图层处理策略
- 改动用户权限模型（角色定义）
- 改动预置的"需理由"规则配置

## 安全和隐私

- 素材是未发布营销计划，对象存储加密
- 审计日志 append-only
- 合规规则双人审核
- API 密钥 secrets manager
- Prompt trace 脱敏

## 成本控制

- PSD 路径 vs AI 路径成本对比监控
- 翻译记忆缓存目标命中率 > 40%
- Veo 预览模式：低清确认后再出高清
- Campaign 级配额
- 月度 BG 结算报表

## 测试要点

1. **合规规则单元测试**：每条系统默认规则有正反例
2. **Brand Override 组合测试**：加严、放宽、禁用三种 override 各有测试
3. **Change Minimization 回归测试**：50 个历史编辑，preservation hash 稳定
4. **严重程度分级测试**：Critical/Warning/Info 的 UI 展示和确认流程
5. **Reason 强制留痕测试**：需理由的规则确认流程完整、理由记录不可变
6. **权限边界测试**：Ad Ops 不能编辑 override、品牌管理员不能跨品牌操作、系统管理员只读
7. **验收测试**：上线前 8 市场各 20 素材（Ad Ops + 品牌管理员参与；NG 含 Lagos + FCT 两个子市场各 20）
8. **性能测试**：大赛前几百素材并发
9. **PSD 解析完整性测试**：解析 → 重组，与原 PSD 对比
10. **监管审计包导出测试**：复现任意历史素材的完整决策链路
