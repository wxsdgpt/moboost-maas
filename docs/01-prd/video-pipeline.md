# PRD：Video-Pipeline 模块（n8n 编排多模型视频流水线）

> 本模块与既有 `video` 模块共存：`video` 解决"单工具直出 5–10 秒"，本模块解决"30 秒–3 分钟、低抽卡率、可控分镜"。
> 配套调研：[`./research/ai-video-tools-2026-04.md`](./research/ai-video-tools-2026-04.md)
> n8n 原型：[`./research/video-pipeline-workflow.json`](./research/video-pipeline-workflow.json)

## 1. 模块定位

**一句话描述**：基于 n8n 工作流，把"一条 30–180 秒视频"拆成多分镜、用关键帧驱动图生视频、靠质检节点自动重抽，最终拼接成片，交付到 Report 模块。

**所属业务链路**：Brief / Report 脚本 → **Video-Pipeline** → Report 页面播放（与既有 `video` 模块互补，不替代）。

## 2. 目标用户 & 使用场景

| 角色 | 场景 | Jobs-to-be-done |
|------|------|-----------------|
| 运营 | 电商带货短视频（30–60s），需要中文口播 + 多分镜带货 | 一键产出可直接投放素材，省外包 |
| 创意 | 品牌广告片（15–30s 高质感），需要爆点镜头 | 同一脚本快速试多版本 |
| 内容运营 | 数字人长视频（1–3 min 知识口播） | 把稿件直接变带主播口播的视频 |
| 增长 | UGC 风量产（日产 50+ 条） | 模板化批量、夜间任务 |

## 3. 用户故事

- **US1**：作为运营，我提交一段中文脚本，系统自动拆 6–10 个分镜，每个分镜先出图、再图生视频、再拼成 60 秒带货片，**总成本 < $3**。
- **US2**：作为创意，我希望能在分镜级别"重抽某一镜"而不必整片重做，且能锁定角色一致性。
- **US3**：作为内容运营，我希望系统对生成的每个分镜自动跑质检（VLM 抽帧问答），不达标自动换模型重抽，最终成片质检通过率 ≥ 95%。
- **US4**：作为开发者，我希望整条流水线就是一份 n8n workflow.json，可版本化、可在 staging/prod 切换模型。
- **US5**：作为运营，我希望支持口播视频—— TTS（中文用 MiniMax）+ 数字人对口型（HeyGen Avatar IV），口型同步度 ≥ 90%。

## 4. 功能需求

### 4.1 必备（MVP，v1.0）

- **F1. 脚本 → 分镜拆解**：调 LLM（OpenRouter）按 schema 输出 `scenes[]`，每条含 `{scene_id, prompt, motion_prompt, duration, transition_type, role_id, voiceover_text}`。
- **F2. 关键帧出图**：默认 Nano Banana（多图融合保持角色），中文海报场景路由到 Seedream。每镜出 **首帧 + 尾帧**。
- **F3. CLIP 一致性质检**：对比本镜首帧与"基准帧"（第一镜首帧）相似度，阈值 < 0.75 触发重抽（最多 3 次）。
- **F4. 图生视频（I2V）**：默认 Kling 2.6 Pro，备选 Seedance 2.0，兜底 Wan 2.6（自托管）。镜头转场处用 Vidu Q1 Start-End-to-Video。
- **F5. VLM 视频质检**：FFmpeg 抽 4 帧，调 Gemini 2.5 Flash 问答"是否符合分镜描述"，不通过自动切下一备选模型重抽（最多 2 次）。
- **F6. TTS**：中文走 MiniMax Speech-02，英文走 ElevenLabs v3，输出 wav。
- **F7. FFmpeg 拼接**：分镜 mp4 + TTS wav + BGM + 字幕 → 最终 mp4，写入 Supabase Storage。
- **F8. 状态轮询**：`GET /api/video-pipeline/status/:jobId` 返回 `{stage, progress, sceneStatuses[], previewUrl}`。
- **F9. 错误可读**：每个 n8n 节点失败转换为 `videoPipelineErrors.ts` 中的可读 code（如 `KEYFRAME_CLIP_FAIL`、`I2V_VLM_FAIL_AFTER_RETRY`）。

### 4.2 增强（后续迭代）

- **E1. HeyGen Avatar IV 对口型**：口播场景，传入照片 + TTS wav，HeyGen 生成对口型片段插入。
- **E2. 自托管降本通路**：n8n 检测 budget 模式，自动切 Wan 2.6 + Latentsync（自托管 GPU）。
- **E3. seed 复用**：成功 seed 入库，重生成同分镜复用 seed。
- **E4. 角色 LoRA 训练**：长期客户提供素材，训 Flux LoRA，复用到所有视频。
- **E5. ComfyUI 子流**：把"出图 + LoRA + 质检"打包成 ComfyUI workflow，n8n 通过 `n8n-nodes-comfyui` 调用。

### 4.3 非目标（明确不做）

- **NG1**. 不替代既有 `video` 模块（VEO 3.1 直出仍服务简单场景）。
- **NG2**. 不做 4K 输出（v1 仅 1080p）。
- **NG3**. 不做实时生成（每条最长可耗时 ~15 分钟）。
- **NG4**. 不接入 Midjourney 主链路（无官方 API，不可工程化）。
- **NG5**. 不在 n8n 流里做"全局重生成"——失败必须分镜级别重抽，避免雪崩。

## 5. 验收标准

每条对应一条 4.x 功能；落地后写入 [`docs/04-test/video-pipeline-test.md`](../04-test/video-pipeline-test.md)。

- [ ] **AC1**. 输入 60 秒中文带货脚本 → 自动拆 6–10 镜，单镜分镜 schema 校验通过（对应 F1）。
- [ ] **AC2**. 每镜首/尾帧 200 OK，CLIP 一致性 ≥ 0.75（对应 F2/F3）。
- [ ] **AC3**. 单镜图生视频 200 OK，VLM 质检通过率单次 ≥ 60%、3 次重抽后 ≥ 95%（对应 F4/F5）。
- [ ] **AC4**. 中文 TTS 字符错误率 < 1%（对应 F6）。
- [ ] **AC5**. 最终成片可在 Report 页直接播放、有声、CSP 不违规（对应 F7，复用 `video` 模块的播放器约束）。
- [ ] **AC6**. 任意阶段失败，`status` 接口返回可读 error code（对应 F9）。
- [ ] **AC7**. `/test/video-pipeline` 测试页端到端通过：提交 demo 脚本 → 5–10 分钟内拿到 mp4 URL。
- [ ] **AC8**. n8n workflow.json 可在干净 n8n 实例 import 后直接运行（dev credentials 通过环境变量注入）。

## 6. 关键指标

| 指标 | 目标 | 测量方式 |
|------|------|---------|
| 端到端成功率 | ≥ 92% | n8n 执行日志 |
| 单条平均成本（电商带货 60s） | $0.8–$2.5 | provider invoice 聚合 |
| 端到端 P95 耗时（60s 带货） | < 12 分钟 | n8n 执行时长 |
| 单镜首抽合格率（图） | ≥ 80% | CLIP 通过率 |
| 单镜首抽合格率（视频） | ≥ 65% | VLM 通过率 |
| 重抽后总合格率 | ≥ 95% | 任务完成数 / 提交数 |
| 视频音画同步偏差 | < 80ms | FFmpeg probe + 抽样人审 |

## 7. 依赖 & 约束

### 7.1 外部依赖

| 项 | 用途 | 环境变量 |
|----|------|---------|
| n8n（self-host） | 编排 | `N8N_BASE_URL`, `N8N_WEBHOOK_TOKEN` |
| OpenRouter | LLM 拆分镜 + VLM 质检 | `OPENROUTER_API_KEY`（已有） |
| Google AI / OpenRouter | Nano Banana 出图 | `GOOGLE_AI_KEY` 或 OpenRouter |
| 火山引擎 OpenAPI | Seedream 出图 + Seedance 视频 | `VOLC_AK`, `VOLC_SK` |
| KlingAI 开放平台 | Kling 视频 | `KLING_API_KEY` |
| Vidu Platform | Vidu Q1 转场 | `VIDU_API_KEY` |
| MiniMax Platform | 中文 TTS | `MINIMAX_API_KEY` |
| ElevenLabs | 英文 TTS | `ELEVENLABS_API_KEY` |
| HeyGen | 数字人对口型（E1） | `HEYGEN_API_KEY` |
| Supabase Storage | 中间产物 + 成片存储（已有） | 沿用 |
| FFmpeg | 拼接 worker | 已自带 |

### 7.2 内部依赖

- **Brief / Report**：通过 API 拿脚本（不直 import 实现，遵循 [`principles.md`](../00-architecture/principles.md)）。
- **现有 `video` 模块**：作为单工具直出 fallback；二者通过 `videoTypes.ts` / `videoPipelineTypes.ts` **类型层级独立**。

### 7.3 约束

- **成本上限**：单条任务硬上限 `MAX_COST_USD`（默认 $5），超出立即终止。
- **超时上限**：单任务总超时 20 分钟。
- **合规**：所有第三方供应商需走官方 API（不接 MJ 等代理产品做主链路）。
- **数据**：用户上传的图片/脚本仅在生成期间存于 Supabase，14 天后自动清理。

## 8. 风险与应对

| 风险 | 可能性 | 影响 | 应对 |
|------|--------|------|------|
| 单一供应商 API 限流 / 故障 | 高 | 整链路阻塞 | 分镜级 fallback：Kling→Seedance→Wan 三层兜底 |
| 国内 / 海外 API 网络抖动 | 中 | 个别分镜失败 | n8n 节点级 retry（指数退避，max 3） |
| 抽卡率波动导致成本超预算 | 中 | 成本超 SLA | 单任务 `MAX_COST_USD` 硬上限 + 实时累计 |
| VLM 质检误判 | 中 | 重抽消耗成本 | 双 VLM 投票（Gemini Flash + GPT-4o-mini）+ 阈值可调 |
| Wan / Latentsync 自托管 GPU 不稳 | 中 | budget 模式失败 | 兜底自动 fallback 到云端付费链路 |
| 第三方模型版本悄悄变化 | 中 | 输出风格漂移 | 在 `videoPipelineConfig.ts` 锁版本号 + 监控帧采样比对 |
| 视频内容合规（NSFW、版权） | 低 | 法律风险 | n8n 增加 NSFW 检测节点（CLIP + 内置黑词表） |
| HeyGen 肖像权 | 低 | 法律风险 | 仅允许使用模特库或经签字授权的照片 |

## 9. 迭代日志

### v1.0 — 2026-04-27（本 PRD）

- 初版：覆盖 F1–F9 必备能力。
- 调研结论：[`./research/ai-video-tools-2026-04.md`](./research/ai-video-tools-2026-04.md)
- n8n 原型：[`./research/video-pipeline-workflow.json`](./research/video-pipeline-workflow.json)
- 选型对比：根目录 `AI视频生成工具选型对比-2026-04.xlsx`

### 待办（v1.1+）

- [ ] **UI**：`docs/02-ui/video-pipeline-ui.md`（配置面板 / 分镜预览 / 质检看板）
- [ ] **Dev**：`docs/03-dev/video-pipeline-dev.md`（`videoPipelineTypes.ts` 契约、API 路由、与 n8n 对接 webhook 协议）
- [ ] **Test**：`docs/04-test/video-pipeline-test.md`（端到端测试用例、历史 bug 回归表初版）
- [ ] **Skill 集成**：把"提交分镜 → 等待 → 取回 mp4"封成 moboost CLI/skill
