# AI 图片/视频生成工具调研 · 2026-04

> 目标：为 moboost-maas 新模块 **video-pipeline** 选型，解决"AI 直出视频时长不足、抽卡率高"问题。
> 关联交付物：
> - PRD：[`../video-pipeline.md`](../video-pipeline.md)
> - 选型对比表：`AI视频生成工具选型对比-2026-04.xlsx`（工作区根目录）
> - n8n 工作流原型：[`./video-pipeline-workflow.json`](./video-pipeline-workflow.json)

## 1. 问题定义

现有 `video` 模块基于 **VEO 3.1**（经 OpenRouter）做单工具直出，PRD 明确"非目标：不做长视频（>30s）、不做图生视频"（见 [`docs/01-prd/video.md`](../video.md)）。
但实际业务里短视频出现两个硬约束：

| 痛点 | 表现 | 影响 |
|------|------|------|
| **时长上限** | 单次直出多在 5–10 秒 | 60 秒带货片必须分段拼接 |
| **抽卡率高** | 文生视频首抽合格率约 30–50% | 单条成片成本/耗时 ×2–3 |
| **可控性弱** | 文字 prompt 难以精确锁定角色、构图、转场 | 多镜头一致性差，品牌片不可用 |

> 所以：**不应继续依赖单工具直出**，而是把"一条 30–60 秒视频"拆成多分镜，在分镜级别做生成 + 质检 + 拼接，靠 **n8n 编排** 把多种模型组合起来取长补短。这是新建 `video-pipeline` 模块的核心动机，与现有 `video` 模块互补（`video` 仍承担单工具简单任务）。

## 2. 工具盘点

### 2.1 图像生成（关键帧产出层）

| 工具 | 厂商 | 价格（USD） | 优势 | 适配场景 |
|------|------|------|------|---------|
| **Nano Banana**（Gemini 2.5 Flash Image） | Google | $0.03–0.039/图 | 多图融合、参考图保持、便宜 | 关键帧批量首选 |
| **Seedream 4.5 / 即梦图像** | 字节火山引擎 | ≈¥0.12/图 | 中文场景顶、商业素材 | 中文带货图、海报 |
| **GPT-Image-1.5 / -mini** | OpenAI | $0.005–$0.19/图 | 文字渲染最强、指令遵循 | 复杂指令、英文海报 |
| Flux.1 Pro / Flux 2 | Black Forest Labs | 本地免费 / Replicate $0.025–$0.055 | LoRA 强、ComfyUI 主力底模 | 风格化、角色训练 |
| Ideogram 3 | Ideogram | ≈$0.05–0.10/图 | 文字渲染稳 | 字体海报 |
| Midjourney v7/v8 | Midjourney | 订阅 $10–120/mo（无官方 API） | 质感独特 | 高端创意（不进主链路） |
| Kling 图像 / Kolors 2.0 | 快手 | ≈¥0.10/图 | 与 Kling 视频同厂 | 视频选 Kling 时延伸 |

**结论**：moboost 关键帧主力用 **Nano Banana**（成本+多图参考）+ **Seedream**（中文场景）+ **Flux@ComfyUI**（需 LoRA 时）。

### 2.2 视频生成（核心引擎层）

| 工具 | 价格 | 时长 | 首尾帧 | 抽卡率（实测） | 推荐定位 |
|------|------|------|--------|---------------|----------|
| **Kling 3.0 / 2.6 Pro** | $0.07–$0.14/s | 10s（可续接） | 支持 | 65–75% | 图生视频主力 |
| **Seedance 2.0 / 即梦视频** | $0.081–$0.10/s | 10s | 支持 | 60–70% | 国产高性价比主力 |
| **Vidu Q1 (Start-End)** | $0.34/run（5s 1080p） | 5–8s | **★ 独家** | 70–80% | 镜头转场专用 |
| **Veo 3.1**（已接入） | ≈$0.4–0.75/s（OpenRouter） | 8–10s | 否 | 55–65% | 同步音频/口播 |
| Wan 2.5 / 2.6 / 2.7 | $0.035–$0.10/run | 10s | 2.7 支持 | 60–70% | 自部署兜底（开源可商用） |
| Hailuo 02 (MiniMax) | $0.25–$0.52/clip | 10s | 否 | 55–65% | 中文人物表演 |
| Runway Gen-4 / Turbo | $0.05/s（信用制） | 10s+ | 关键帧支持 | 55–65% | 海外平台 |
| Sora 2 / Sora 2 Pro | $0.10–$0.50/s | 10s | 否 | 60–70% | 物理一致复杂动作 |
| Luma Ray 2 / Ray 3 | $0.50/5s | 10s | 支持 | 50–60% | 写实电影质感 |
| Pika 2.2 | $28/mo 起 | 5–10s | 支持 | 45–55% | 二次元（API 较弱） |

**关键发现**：
- **图生视频（I2V）抽卡率 ≈ 文生视频（T2V）的 1.5–2 倍**：先把首帧"画"出来再驱动视频，是降抽卡的根基。
- **Vidu Q1 的首尾帧（Start-End-to-Video）是降抽卡杀手锏**：给定首尾两张图，中间运动自由但两端锁死。镜头转场一致性可从 70% 提到 95%。
- **Kling 3.0 在 ELO 榜（2026-02 起）排第一**，运动质量超过 Veo 3.1 与 Runway Gen-4.5。
- **Seedance 2.0 国产首选**：中文 prompt 服从度高、价格仅 Kling 的 60%，1080p 稳出。
- **Sora 2 太贵**：仅在关键 1–2 个镜头使用（爆点镜头）。

### 2.3 编排与辅助

| 类别 | 工具 | 关键事实 |
|------|------|----------|
| **编排核心** | **n8n** | 自托管/云均可，社区有 `n8n-nodes-comfyui` 节点 |
| **重模型流** | **ComfyUI** | 通过 RunComfy 转 API 后可被 n8n 调用 |
| TTS | ElevenLabs (英) / **MiniMax Speech-02** (中) | 中文带货必上 MiniMax；英文广告片 ElevenLabs v3 |
| 对口型 | **HeyGen Avatar IV** ($1–5/min) / Latentsync (开源) | 云端选 HeyGen，自托管选 Latentsync |
| 后期 | **FFmpeg** / Creatomate | 拼接/字幕/水印/音轨 |
| 质检 | CLIP（图像）+ VLM Gemini 2.5 Flash（视频抽帧问答） | 是降抽卡 + 自动重抽的依据 |
| 存储 | Supabase Storage（现有） | 直接复用 |

## 3. 解决方案：分镜化 + 多模型协同 + 质检重抽

### 3.1 核心架构

```
脚本(LLM)
  └─→ 分镜列表 [scene_1, scene_2, ..., scene_N]   // 每个 5–8s
        └─→ ┌─ 关键帧出图 (Nano Banana / Seedream)
            ├─ CLIP 一致性质检 ── 不合格 ⟲ 重抽 (≤3次)
            ├─ 图生视频 (Kling 主 / Seedance 备 / Wan 兜底)
            ├─ VLM 抽帧质检   ── 不合格 ⟲ 重抽 (≤2次)
            └─ 缓存 seed/帧到 Supabase
        ↓
        镜头衔接处用 Vidu Q1 (Start-End-to-Video) 生成转场片段
        ↓
        TTS (MiniMax / ElevenLabs) → HeyGen 对口型 (如有口播)
        ↓
        FFmpeg 拼接 + BGM + 字幕 + 水印
        ↓
        最终 mp4 → Supabase Storage → Webhook 通知
```

### 3.2 降抽卡 10 项策略（详见 xlsx Sheet "抽卡率治理"）

最高优先级三条：

1. **分镜化拆解**：失败影响范围 ÷ 6–10 倍。
2. **I2V 替代 T2V**：首抽合格率 30%→65%。
3. **首尾帧锁定**：长视频镜头一致性 70%→95%（用 Vidu Q1）。

其余：CLIP 角色一致性、VLM 视频质检、重抽兜底链、seed 固定、LoRA、prompt 模板库、低分辨率试拍。

### 3.3 推荐组合（按场景）

| 场景 | 关键帧 | 图生视频 | TTS | 单条成本 | 单条耗时 |
|------|--------|---------|-----|---------|---------|
| **电商带货 30–60s（首选场景）** | Seedream + Nano Banana | Seedance 2.0 主 + Kling 爆点 + Vidu Q1 转场 | MiniMax Speech-02 | $0.8–$2.5 | 5–10 min |
| 品牌广告 15–30s | Flux+LoRA + Midjourney | Sora 2 Pro 爆点 + Kling 主 | ElevenLabs v3 | $8–$25 | 20–40 min |
| 数字人长片 1–3 min | Nano Banana 背景 | Veo 3.1 / Kling 背景 | MiniMax / ElevenLabs + **HeyGen Avatar IV 主体** | $5–$15 | 8–15 min |
| 二次元短片 10–30s | Flux + Anime LoRA | Hailuo 02 主 + Pika 备 | fish-speech | $0.5–$1.5 | 5–8 min |
| 超低成本量产（日 50+） | Nano Banana | Wan 2.6（自托管或 Atlas）+ Seedance Fast | MiniMax | $0.2–$0.6 | 2–4 min |

## 4. 与现有 moboost-maas 模块的关系

- 新建 `video-pipeline` 模块（高内聚），与现有 `video` 模块共存，不改 `video` 已交付的能力。
- `video`：单工具直出（VEO 3.1），5–10 秒，简单 prompt 场景。
- `video-pipeline`：n8n 编排多工具，30 秒–3 分钟，分镜级质检，复杂剧本。
- 二者通过 `videoPipelineTypes.ts` 暴露契约，**不跨模块直 import**（遵循 [`docs/00-architecture/principles.md`](../../00-architecture/principles.md)）。
- 入口：`POST /api/video-pipeline/generate`（提交脚本/分镜）+ `GET /api/video-pipeline/status/:jobId`（轮询）。
- 与现有模块协作：
  - `Brief` 提供素材摘要 → 进入 LLM 拆分镜节点；
  - `Report` 的脚本字段是主要输入；
  - `Landing` 不变；
  - 最终视频回写 `Report` 的 video 字段，复用现有播放器。

## 5. 开源/合规风险

| 风险 | 应对 |
|------|------|
| Midjourney 无官方 API、第三方代理违反 ToS | **不进主链路**，仅做创意参考 |
| Sora 2 / Veo 国内访问受限 | 关键节点国内备选：Seedance / Kling / Wan |
| 第三方代理 Sora/Kling 商用合规 | 商用版统一走官方 API（KlingAI 开放平台 / OpenAI 直连） |
| Wan 2.x 开源但权重协议 | 商用前确认 Apache-2.0 / Tongyi-Qianwen License 范围 |
| 数字人肖像权 | HeyGen Avatar IV 用照片须取得授权；模特库素材有内置授权 |
| 内容合规（NSFW/版权） | n8n 加 NSFW 检测节点（CLIP + 内置黑名单） |

## 6. 下一步

按 `docs/CONTRIBUTING.md` 四层流程：

1. **PRD**：[`../video-pipeline.md`](../video-pipeline.md) ✅ 本调研同步产出。
2. **UI**：补 `docs/02-ui/video-pipeline-ui.md`（Pipeline 配置面板、分镜预览、质检看板）。
3. **Dev**：补 `docs/03-dev/video-pipeline-dev.md`（API 契约、`videoPipelineTypes.ts`、与 n8n 的对接方式）。
4. **Test**：补 `docs/04-test/video-pipeline-test.md`（单元/集成/视觉用例 + 历史 bug 回归）。

n8n 工作流原型可直接 import：[`./video-pipeline-workflow.json`](./video-pipeline-workflow.json)。

## 附录：信息来源

价格与版本数据采集于 2026-04-27，已在多份独立来源交叉验证（Atlas Cloud、fal.ai、OpenRouter 价格页、官方 docs、第三方测评）。**API 价格变动频繁，落地前必须以官方文档为准**。

主要来源链接见交付物对话中的 Sources 段。
