# 系统架构

## 分层架构

```
┌─────────────────────────────────────────────┐
│  投放渠道层 (Google/Meta/TikTok/自有渠道)     │
├─────────────────────────────────────────────┤
│  导出与分发层 (格式适配、元数据打包)           │
├─────────────────────────────────────────────┤
│  审核工作流层 (多级审批、法务介入、审计)       │
├─────────────────────────────────────────────┤
│  合规引擎层 (规则引擎 + AI 检查 + 确定性叠加)   │
├─────────────────────────────────────────────┤
│  本地化执行层 (策略应用、PSD/AI 编辑/文字处理) │
├─────────────────────────────────────────────┤
│  Prompt Assembly 层 (统一分层拼接服务)        │
├─────────────────────────────────────────────┤
│  源素材解析层 (PSD 解析、多模态 LLM、视频解析) │
├─────────────────────────────────────────────┤
│  资产管理层 (素材、品牌库、术语、规则)         │
├─────────────────────────────────────────────┤
│  接入层 (手动上传、云盘集成)                   │
└─────────────────────────────────────────────┘
```

## 核心技术决策

### 1. PSD-First, AI-Backup
- PSD/AI 可编辑图层优先用确定性图层替换（快、准、零风险）
- 扁平化图片使用 Nano Banana 精准编辑（AI 作为 fallback）
- 两条路径的 UI 和结果体验一致，用户无感知

### 2. Localizable Units (LU) 模式
- 系统不把素材当黑盒，而是解构为可本地化单元
- 用户按单元选择策略，系统按策略执行
- 详见 `LOCALIZABLE_UNITS.md`

### 3. Change Minimization（变更最小化）
- 每次 AI 编辑必须指定精确区域
- 未修改区域用 perceptual hash 验证与源素材一致
- 避免 AI "越界修改"

### 4. LLM-Only 文字处理
- 所有翻译（literal / light / transcreate）统一走 LLM
- 不使用 DeepL / Google Translate
- 翻译记忆（TM）缓存控制成本

### 5. 多模态 LLM 替代 OCR
- 图片文字提取和分类由多模态 LLM 完成
- 一次调用完成"文字 + 角色 + 合规筛查"

### 6. Veo 3.1 原生音频
- 视频配音替换用 Veo 3.1 原生能力
- 不使用独立 TTS 服务
- 按市场注入语调约束

### 7. 确定性合规叠加
- 合规元素（RG logo、警语、牌照号）不交给 AI 生成
- 用代码层（Pillow/FFmpeg）确定性渲染
- 确保法务审计可通过

### 8. 用户只看成品
- UI 隐藏处理细节，只展示最终可用素材
- 后端记录完整处理链路供审计
- 简化用户体验，专业度留在后台

## 端到端流水线

```
用户上传源素材
    ↓
Source Asset Parser
  - PSD/AI → 图层树提取
  - 扁平图 → 多模态 LLM 识别
  - 视频 → 帧分析 + 音频转录
    ↓
Parsed Asset with Localizable Units
    ↓
Default Strategy Resolver
  (按 LU 类型、market、brand 规则生成默认策略矩阵)
    ↓
用户审阅 / 调整策略矩阵（可选，可直接用默认）
    ↓
Batch Strategy Applier（并行处理 8 个市场）
  ↓     ↓     ↓     ↓     ↓     ↓     ↓     ↓
  US    UK    PH    IN    BR    FR    DE    NG
    ↓
For each LU × market:
  Route to handler:
  - Text + PSD layer → PSD text replacement
  - Text + flat image → Nano Banana text edit + Change Min Check
  - Text + video overlay → Frame edit + reassembly
  - Visual + replacement → Nano Banana element edit + Change Min Check
  - Audio + replace → Veo 3.1 audio regen
  - Compliance → Deterministic overlay (Pillow/FFmpeg)
    ↓
Assembled per-market assets
    ↓
Compliance Engine
  - Rule-based check (forbidden words, required elements)
  - Multimodal LLM vision check
  - Audit report generation
    ↓
Review Workflow
  Auto check → Market Manager → Legal (DE/US/UK/FR mandatory)
    ↓
Approved per-market assets
    ↓
Export Adapters (Meta / Google / DSP formats)
```

## 图片本地化流水线

```
PSD 源文件                          扁平化图源文件
    ↓                                   ↓
PSD 解析器                          多模态 LLM 理解
(psd-tools)                         (Gemini)
    ↓                                   ↓
文字图层 → Text LUs                  文字区域 → Text LUs (含 bbox)
图像图层 → Visual LUs                视觉元素 → Visual LUs (含 mask)
    ↓                                   ↓
用户策略选择                          用户策略选择
    ↓                                   ↓
For each text LU:                    For each text LU:
  LLM 翻译/创译                        LLM 翻译/创译
  PSD 文字图层替换                     Nano Banana 文字替换 (with mask)
  (确定性，零风险)                      + Change Min Check
                                         (验证非目标区域未变)

For each visual LU:                  For each visual LU:
  (通常 keep_original)                 (通常 keep_original)
  替换需求：图层替换                    替换需求：Nano Banana + mask
                                                    + Change Min Check
    ↓                                   ↓
图层重组导出                          图像重组
    ↓                                   ↓
              合规元素叠加（Pillow 确定性渲染）
                         ↓
                  Per-market 最终图片
                         ↓
                  合规引擎检查
```

## 视频本地化流水线

**产品契约：视频进，视频出。输入视频的技术属性（比例、时长、码率、格式）保持不变，系统只修改和市场本地化相关的内容。**

```
MP4 源视频（输入格式 = 输出格式）
    ↓
Video Parser
  - 帧采样分析（检测 overlay 文字）
  - 音频提取 + Whisper/Gemini 转录
  - 场景边界检测
    ↓
Video LUs:
  - Text LUs (with time ranges)
  - Audio LUs (dialogue, music, sfx 分离)
  - Visual LUs (per scene)
    ↓
用户策略选择（批量默认 + 单市场覆盖）
    ↓
For each Text LU:                  For each Audio LU:
  LLM 翻译                           keep_original → 跳过
  Frame editing:                     subtitles_only → LLM 翻译 → 生成 SRT
    - 受影响帧范围                   replace_dialogue → Veo 3.1 音频重生
    - 每帧 Nano Banana 文字替换       keep_with_subtitles → Veo 保留 + 生成 SRT
    - 帧间一致性检查
    - 视频帧重组
    ↓                                  ↓
              合规元素叠加层（本地化的一部分）
                - 各市场警语、RG logo、license 编号不同
                - 必须像素级精确渲染，AI 不可用
                - 实现：Pillow（图片）、FFmpeg / MoviePy（视频）
                - 这是系统中唯一需要传统视频处理工具的环节
                         ↓
              合规引擎检查
                         ↓
              输出：本地化后的视频（格式/比例/时长与输入一致）
                    + 可选的字幕文件（SRT）
```

## 本地化的边界（重要）

**属于本地化（系统负责）**：
- 翻译文字、替换配音、替换人物/场景
- 叠加各市场特定的合规元素
- 删除违禁元素（某市场禁酒精等）
- 生成目标语言字幕文件（SRT）

**不属于本地化（系统不负责）**：
- 比例转换（16:9 ↔ 9:16 是渠道需求，不是市场差异）
- 多码率/多格式导出（平台技术需求）
- 剪辑时长版本（6/15/30/60 秒是运营需求）
- 字幕硬编码烧录（播放器/平台可处理）

如果用户需要多个比例或时长版本，应由设计/运营工作流提供多个源素材，每个都是独立的本地化任务。

## 审核与确认工作流（简化版，无法务层）

```
营销专员/Ad Ops 提交本地化结果
    ↓
Stage 1: 自动合规检查 (秒级)
  - 规则引擎评估（系统默认 + 品牌 override）
  - 视觉 AI 检查：年龄、名人、logo、合规元素
  - 变更最小化验证（perceptual hash）
  - 生成合规报告（Critical / Warning / Info 分级）
    ↓
Stage 2: Ad Ops 审阅和确认
  - 查看合规报告（即使零违规也需审阅）
  - 单独确认每个 Critical 和 Warning
  - Critical 警告按配置需要填写"放行理由"
  - 点击"Confirm and Distribute"（必经步骤）
    ↓
AssetConfirmation 不可变记录生成
    ↓
按渠道格式导出
```

**关键变化**：合规检查不硬拦截，所有发现都以警告形式展示；Ad Ops 承担最终决策责任；系统提供充分上下文和完整审计留痕。详见 `COMPLIANCE_GOVERNANCE.md`。

## 技术栈建议

### 后端
- **语言**：Python (FastAPI)
  - AI 生态成熟（psd-tools、moviepy、ffmpeg-python）
  - 多模态 LLM SDK 全
- **异步任务**：Celery + Redis（或 Temporal）
- **数据库**：PostgreSQL + Redis
- **对象存储**：S3
- **规则引擎**：自建 DSL 或 JSON-logic
- **Prompt Assembly**：独立模块 `prompt_assembly/`

### 前端
- **框架**：Next.js + React
- **i18n**：next-intl（英文 only，但从第一天使用）
- **UI 库**：shadcn/ui
- **图片/视频预览**：Konva.js (图片标注) + Video.js (视频播放)
- **策略矩阵 UI**：自定义表格组件（这是核心交互）

### AI/ML 服务
- **LLM**：Anthropic Claude（主）+ OpenAI GPT-4（备）
- **多模态理解**：Gemini（与 Nano Banana 同家族，上下文一致）
- **图像编辑**：Google Vertex AI（Nano Banana）
- **视频编辑**：Google Vertex AI（Veo 3.1）
- **视频转录**：Whisper 或 Gemini 视频理解
- **视觉合规辅助**：多模态 LLM + AWS Rekognition（名人/logo）

### PSD 和视频处理
- **PSD**：`psd-tools`（Python）或 `ag-psd`（Node）
- **视频**：`ffmpeg-python` + `moviepy`
- **图片合成**：`Pillow` + `cairo` + 确定性字体渲染

### 基础设施
- **容器化**：Docker + Kubernetes
- **CI/CD**：GitHub Actions
- **监控**：Prometheus + Grafana
- **AI 可观测性**：Langfuse 或 Helicone
- **日志**：ELK / Loki

## 成本控制策略

1. **PSD 优先路径**：有图层就不用 AI，成本从 $0.10+ 降到 ~$0
2. **翻译记忆缓存**：同源文本 + 同市场命中直接返回
3. **批量 LLM 调用**：一个素材的多段文字合并
4. **AI 编辑的 mask 精确化**：区域越小，生成越快越便宜
5. **Veo 预览模式**：低清预览确认后再出高清
6. **Campaign 级配额**：防止失控
7. **按用户/项目成本报表**：按月出账

## 安全和隐私

- 对象存储加密
- 审计日志表 append-only
- 合规规则双人审核
- API 密钥 secrets manager
- 源素材可能是未发布计划，RBAC 严格执行
- Prompt trace 不含敏感 PII
