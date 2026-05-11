# MVP 功能清单（V1，3-4 个月）

## 产品定位重申

**本地化工具，不是生成工具。** 文字进文字出，图片进图片出，视频进视频出。AI 做编辑，不做创作。

## P0 必须有

### 用户与权限
- [ ] 用户登录（SSO 优先，邮箱备选）
- [ ] 三种角色权限（营销专员/Ad Ops、品牌管理员、系统管理员）
- [ ] 基础的项目组织结构
- [ ] 多品牌支持（用户属于一个或多个品牌）
- [ ] RBAC 严格执行（源素材可能是未发布计划）

### 源素材接入
- [ ] 手动上传：PSD、AI、PNG、JPG、MP4
- [ ] 一个云盘集成（Google Drive 优先）
- [ ] 文件元数据提取（尺寸、格式、时长、图层信息）
- [ ] 素材版本管理（同一素材的迭代）

### 源素材解析（Source Asset Parser）
- [ ] PSD 图层树解析（psd-tools）
- [ ] PSD 文字图层提取（含字体、颜色、大小）
- [ ] 扁平图多模态 LLM 解析（文字 + 视觉 + 合规筛查）
- [ ] 视频帧采样 + overlay 文字检测
- [ ] 视频音频提取 + 转录（Whisper / Gemini）
- [ ] Localizable Unit 生成
- [ ] Parse warnings 提示用户（如小字识别不确定）

### Localizable Unit (LU) 系统
- [ ] LU 数据模型（Text / Visual / Audio / Compliance）
- [ ] LU 语义角色分类（CTA / legal / odds / brand_name 等）
- [ ] Smart Default Strategy Resolver（按 market + LU 类型生成默认策略）
- [ ] Per-market Strategy Matrix UI
- [ ] 批量模式 + 单市场覆盖

### 本地化策略应用
- [ ] Text strategies: keep / literal / light / transcreate / user_provided
- [ ] Visual strategies: keep / replace_for_compliance / localize_culturally / custom
- [ ] Audio strategies: keep / subtitles_only / replace_dialogue / with_subtitles
- [ ] PSD 文字图层替换（确定性路径）
- [ ] Nano Banana 图片内文字替换（AI 路径）
- [ ] Nano Banana 图片元素替换（AI 路径）
- [ ] Nano Banana 图片元素删除（合规）
- [ ] 视频 overlay 文字替换（帧级处理 + 一致性）
- [ ] Veo 3.1 视频配音替换（按市场 audio layer）
- [ ] Veo 3.1 Video Extend 支持（最长 148 秒，Google 自动合并）
- [ ] 字幕生成和合成（确定性视频处理层）

### Prompt Assembly 核心服务
- [ ] Layer 抽象和 Layer 库
- [ ] 至少 10 个核心 Layer（Base / SourceAnchor / Mask / FontStyle / BrandRestrictions / BrandVoice / BrandGlossary / MarketLanguage / MarketCompliance / MarketCulture / MarketAudio / UserInstruction / SourceContext / FewShot）
- [ ] 9 个 Use Case 支持
- [ ] Assembly trace 完整记录
- [ ] Token 预算监控

### 品牌和术语管理（简化版）
- [ ] Brand CRUD（restrictions / voice）
- [ ] Glossary CRUD（带 market-level translations）
- [ ] Glossary locked_transcreations 支持（跳过 LLM）
- [ ] 版本管理

### 合规引擎（8 个市场 + 子市场）
- [ ] **两层规则系统**：系统默认规则（代码维护）+ 品牌 override 层
- [ ] 系统默认规则库（8 市场：US、UK、PH、IN、BR、FR、DE、NG）
- [ ] **US 子市场模型**：全部 ~38 合法州各自独立规则包，V1 内容按 Tier 推进（Tier 1: NJ、PA、NY、MI、IL、MA、OH、CO；Tier 2: TN、VA、IN、AZ、MD、CT、IA、LA、KS、KY；Tier 3+: 其余 20 州 baseline 规则包）
- [ ] **US 禁投州保护**：CA、TX、UT、HI 等明确禁止，分发元数据强制排除
- [ ] **NG 子市场模型**（与 US 同 handler）：V1 优先 Lagos (LSLGA) + FCT (NLRC)，其他州 data model 预留 + minimal 规则包
- [ ] **NG 州级分发元数据**：`target_sub_market` 含 NG-LA / NG-FCT 等用于地理围栏
- [ ] **IN 邦级 blocklist 模型**：一套 IN 素材 + 邦禁投清单 + 地理围栏元数据
- [ ] **IN ASCI 合规**：全国适用的警语、20% 面积要求
- [ ] **Karnataka 易变状态**：默认禁投 + 品牌可 override
- [ ] 品牌 Override CRUD（add / tighten / relax / disable）
- [ ] 规则编译和评估引擎（多层：联邦 + 州/邦 + 品牌）
- [ ] 三级严重程度（Critical / Warning / Info）
- [ ] 违禁词检测（按市场词库）
- [ ] 强制元素检查（RG logo、警语、牌照号、18+/21+）
- [ ] 合规元素自动叠加（Pillow/FFmpeg 确定性渲染）
- [ ] 视觉 AI 检查：年龄、名人、卡通、logo
- [ ] 德国特殊规则：时段元数据、赔率展示限制、calm audio
- [ ] 变更最小化验证（perceptual hash）
- [ ] 合规报告生成（JSON + PDF）
- [ ] 预置"推荐需理由"规则配置
- [ ] 系统管理员维护子市场法律状态

### 审核与确认工作流（简化版）
- [ ] 两阶段流程：自动合规检查 → Ad Ops 确认
- [ ] **全警告模式**：不硬拦截，Critical 警告视觉突出
- [ ] 按规则类型的"需理由"机制（品牌管理员可配置）
- [ ] Reason 输入（最小长度、反垃圾检查）
- [ ] 零违规素材的强制确认流程
- [ ] 每个警告单独确认
- [ ] AssetConfirmation 完整记录（不可变）

### 品牌管理员功能
- [ ] 品牌设置（restrictions / glossary / voice）
- [ ] 品牌 Override 规则管理 UI
- [ ] 规则级"需理由"配置
- [ ] 品牌内用户管理
- [ ] 品牌级审计历史查看
- [ ] Override 变更通知（品牌内其他成员 + 系统管理员）

### 系统管理员功能
- [ ] 跨品牌只读 override 仪表板
- [ ] 识别高 override 数量的品牌
- [ ] 识别高频被禁用的系统规则
- [ ] 用户和品牌管理
- [ ] 成本和使用报表
- [ ] 系统范围审计历史

### 审计与日志
- [ ] AI 调用全量日志（输入/输出/成本 + 策略 + brand 版本 + 规则版本）
- [ ] 操作审计日志（append-only）
- [ ] Source Asset + LU + 策略 + 输出 的完整追溯链
- [ ] AssetConfirmation 记录（谁、何时、看到什么、理由）
- [ ] 规则版本快照（系统默认 + 品牌 override 的组合快照）
- [ ] 规则变更历史（override 变更、系统规则更新）
- [ ] 监管审计包导出 PDF

### 用户界面
- [ ] 素材上传页（拖拽 + 云盘导入）
- [ ] 解析结果预览页
- [ ] Strategy Matrix 编辑页（核心）
- [ ] 生成进度页（异步任务状态）
- [ ] 成品展示页（8 市场并排预览，含 US 和 NG 的子市场分组）
- [ ] 审核工作流页
- [ ] 全英文 UI（用 next-intl 从第一天）
- [ ] 多语言内容正确显示（lang 属性、BCP 47 标签）

### 导出分发
- [ ] Meta Ads 格式导出
- [ ] Google Ads 格式导出
- [ ] 通用 MP4 + 元数据包（DSP 可用）
- [ ] 投放限制元数据（时段、地区、平台）

### 成本追踪
- [ ] 按素材/项目/用户统计 AI 调用成本
- [ ] PSD 路径 vs AI 路径成本对比
- [ ] 翻译记忆缓存命中率
- [ ] 月度成本报表

## P1 强烈建议（V1.5，+1-2 个月）

- [ ] DAM 深度集成（Bynder 或 Frontify）
- [ ] TikTok Ads 格式适配
- [ ] Strategy Preset（用户保存常用策略组合）
- [ ] 高级 PSD 支持（智能对象、调整图层）
- [ ] 动图 GIF 作为独立 LU 类型
- [ ] 体育赛事活动模式（批量处理优化，数百素材并发）
- [ ] 紧急下架功能

## P2 迭代增强

- [ ] HTML5 素材支持
- [ ] 印度多语言扩展（印地语、泰米尔语）
- [ ] 效果数据回流和 A/B 测试
- [ ] 基于历史批准的策略推荐
- [ ] 监管变化订阅和自动规则更新
- [ ] OCR backup（如多模态 LLM 小字识别率不足）
- [ ] Campaign 层（如果未来扩展到创意生成）
- [ ] Brand voice fine-tuning

## 明确不做（V1 范围外）

**不属于本地化的素材操作**：
- 比例转换（16:9 ↔ 9:16，是渠道需求）
- 多码率/多格式导出（平台技术需求，不是市场差异）
- 剪辑时长版本（6/15/30/60 秒是运营需求）
- 字幕硬编码烧录（默认生成 SRT 文件）

**其他范围外**：
- 从 brief 生成新素材
- 创意构思辅助
- 实时赔率对接
- Affiliate 素材管理
- 游戏内嵌广告
- 素材效果分析仪表板（V1 先解决生产）
- 品牌视觉 VI 系统（色板、字体、reference pack）
- Campaign 类型预设

核心契约：**视频进，视频出。输入的技术属性（比例/时长/码率）= 输出的技术属性。**

## 开发 Phase 划分

### Phase 1: Scaffolding (2 weeks)
基础框架、数据库、认证、S3、i18n 骨架、Docker 环境

### Phase 2: Source Parsing + LU System (3-4 weeks)
PSD 解析、多模态 LLM 解析、视频解析、LU 数据模型、Strategy Matrix UI

### Phase 3: AI Integrations + Prompt Assembly (3-4 weeks)
Prompt Assembly 服务、Nano Banana 文字替换、Nano Banana 元素替换、Veo 3.1 音频替换、LLM 翻译/创译、Change Min Verification

### Phase 4: Compliance + Workflow (3-4 weeks)
规则引擎、合规检查、确定性叠加、审核工作流、审计日志

### Phase 5: Export + Deployment (2-3 weeks)
导出适配、成本追踪、监控、端到端测试、生产部署

**Total: ~14 weeks** 

## 上线前验收测试

- 8 个市场各处理 20 个本地化素材（NG 含 NG-LA 和 NG-FCT 各 10）
- 品牌管理员和 Ad Ops 参与验收（无法务）
- 记录：合规检查准确率、误报率、漏报率
- 特别测试：
  - 小字法律警语识别准确率
  - 变更最小化（AI 是否只改该改的）
  - 德国 audio 合规（无 hype）
  - 源素材与本地化素材的像素对比
  - Brand Override 的叠加效果（加严、放宽都要测）
  - 高风险规则的"需理由"确认流程
  - 监管审计包导出的完整性
