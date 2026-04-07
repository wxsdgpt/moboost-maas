# Moboost AI MAAS — AI Collaboration Context

> **为 AI 助手准备的快速上手文档**。新会话开始时先读这个文件，可以立刻了解项目全貌、当前进度和关键决策。

---

## 项目概述

**Moboost AI MAAS** = Marketing-as-a-Service，面向 iGaming（体育博彩/在线赌场/电竞）的 AI 营销素材生成平台。

**核心 VC Demo 截止日期：2026-04-20（V1）**

用户一句话描述需求（中英文均可），平台自动：
1. 路由到最佳 AI 模型（ModelRouter 动画）
2. 生成图片（NanoBanana Pro / Gemini 3 Pro）或视频（VEO 3.1）
3. D1-D4 四维评估素材质量（Claude Sonnet）
4. 保存到 Project 工作区，支持持续对话迭代

---

## 技术栈

| 层 | 技术 |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS (light theme only) |
| State | 自定义 event-based store (`useSyncExternalStore`) |
| AI API | OpenRouter (`https://openrouter.ai/api/v1`) |
| Runtime | Node.js (API Routes) |

---

## 文件结构

```
src/
├── app/
│   ├── page.tsx                    # 首页：输入框 + 项目列表，提交后跳转 workspace
│   ├── layout.tsx                  # Root layout：Sidebar + MainContent + Notifications
│   ├── globals.css                 # CSS 变量 (light theme)
│   ├── project/
│   │   ├── page.tsx                # 项目列表页
│   │   └── [id]/page.tsx           # ⭐ 3列工作区 (thumbnails|canvas|chat)
│   ├── evolution/page.tsx          # Agent Evolution 页（占位）
│   ├── tools/page.tsx              # Tools 页（占位）
│   └── api/
│       ├── generate/route.ts       # 图片生成 → NanoBanana Pro
│       ├── generate-video/route.ts # 视频生成 → VEO 3.1 (async)
│       ├── evaluate/route.ts       # D1-D4 评估 → Claude Sonnet
│       ├── debug-generate/route.ts # 调试用（可删）
│       └── debug-video/route.ts    # 调试用（可删）
├── components/
│   ├── Sidebar.tsx                 # 可折叠侧边栏 (240/64px)，workspace 页自动隐藏
│   ├── MainContent.tsx             # 动态 margin wrapper，workspace 页全宽
│   ├── ModelRouter.tsx             # 模型路由动画组件
│   ├── ThinkingPanel.tsx           # 思考步骤动画面板
│   └── Notifications.tsx           # Toast + Bell 通知系统
├── lib/
│   ├── store.ts                    # ⭐ 全局状态管理（核心文件）
│   ├── openrouter.ts               # OpenRouter 客户端
│   └── storage.ts                  # 本地文件存储工具
└── types/
    └── index.ts                    # 类型定义
```

---

## 核心文件详解

### `src/lib/store.ts` — 全局状态

**关键接口：**
```typescript
interface GeneratedAsset { id, jobId, type, imageData?, videoData?, videoUrl?, thumbnailData?, prompt, evaluation?, createdAt }
interface ChatMessage    { id, role, content, timestamp, jobId?, imageData?, allImages?, videoData?, videoUrl?, evaluation?, isGenerating?, isEvaluating?, error? }
interface GenerationJob  { id, projectId, type, prompt, status, createdAt, thinkingSteps?, imageData?, videoJobId?, videoData?, evaluation?, completedAt?, error? }
interface ProjectRecord  { id, name, createdAt, jobs, messages, assets, selectedAssetId, status }
```

**关键方法：**
- `store.createProject(name, firstMessage?)` → 创建 project，返回 ProjectRecord
- `store.addJobToProject(projectId, job)` → 添加 generation job
- `store.addMessageToProject(projectId, msg)` → 添加聊天消息
- `store.updateMessageInProject(projectId, msgId, updates)` → 更新消息（生成完成后调用）
- `store.addAssetToProject(projectId, asset)` → 生成完成后添加素材到左侧缩略图列表
- `store.selectAsset(projectId, assetId)` → 在中间画布显示该素材
- `store.getProject(projectId)` → 获取最新 project 数据（fresh，不用 stale closure）
- `pollVideoJob(projectId, jobId, videoJobId, prompt)` → 后台轮询 VEO 视频任务

---

### `src/app/project/[id]/page.tsx` — 工作区（最核心）

**3列布局：**
```
[80px 缩略图] | [flex 中间画布] | [380px 聊天+输入]
```

**生命周期：**
1. 首次进入时检测 `routing` 状态的 job（从首页跳转过来带的）
2. 自动启动 `showRouter=true` → ModelRouter 动画
3. `handleRouterComplete` → 调用 `/api/generate` 或 `/api/generate-video`
4. 生成完成 → `store.addAssetToProject` → 左侧出现缩略图 → `store.selectAsset` 自动选中 → 中间画布显示
5. 继续在右侧输入框迭代生成

---

## API 集成详解

### 环境变量 (`.env.local`)
```
OPENROUTER_API_KEY=sk-or-v1-xxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
IMAGE_MODEL=google/gemini-3-pro-image-preview
VIDEO_MODEL=google/veo-3.1
EVAL_MODEL=anthropic/claude-sonnet-4-6
```

### 图片生成 — NanoBanana Pro (Gemini 3 Pro)
- **端点：** `POST /api/v1/chat/completions`
- **模型：** `google/gemini-3-pro-image-preview`
- **⚠️ 关键：** 图片在 `message.images[]` 数组里，**不在** `message.content`（content 为 null）
- **格式：** `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }`
- **代码位置：** `src/app/api/generate/route.ts` 里先检查 `message.images[]`

### 视频生成 — VEO 3.1（异步）
- **提交：** `POST /api/alpha/videos` → 返回 `{ id, status: "pending" }`
- **轮询：** `GET /api/alpha/videos/{id}` → 等到 `status === "completed"`
- **下载：** `GET /api/alpha/videos/{id}/content?index=0` → 二进制转 base64
- **耗时：** ~70秒，约 $1.60/条
- **代码位置：** `src/app/api/generate-video/route.ts`（三个 action：submit/poll/download）
- **后台轮询：** `pollVideoJob()` 函数在 store 里，5s 间隔，最多 30 次

### D1-D4 评估 — Claude Sonnet
- **端点：** `POST /api/v1/chat/completions`
- **模型：** `anthropic/claude-sonnet-4-6`
- **评估维度：**
  - D1 规格合规（尺寸/格式/法规）
  - D2 内容完整性（信息是否完整）
  - D3 表达力（视觉冲击/创意）
  - D4 竞争优势（差异化/吸引力）

---

## 用户流程

```
首页输入 → store.createProject + addJobToProject → router.push(/project/[id])
    ↓
工作区 useEffect 检测 routing job → setShowRouter → ModelRouter 动画
    ↓
handleRouterComplete → 调用 /api/generate 或 /api/generate-video
    ↓
生成完成 → store.addAssetToProject → 左侧缩略图出现 → 中间画布自动显示
    ↓
自动触发 D1-D4 评估 → 右侧聊天显示评分
    ↓
用户继续在右侧输入框迭代（所有消息持久化在 project.messages）
```

---

## 已知问题 & 待完善

- [ ] 中间画布 "Edit" 按钮功能未实现（目前只是占位）
- [ ] 视频完成后应自动更新对应的聊天消息（目前只加 notification）
- [ ] 评估数据应链接到 asset（目前只在 job 上）
- [ ] debug API 路由可以删除：`/api/debug-generate`、`/api/debug-video`
- [ ] `node_modules` 未提交，clone 后需要 `npm install`
- [ ] 数据存在内存中，刷新页面会丢失（V1 OK，V2 需接数据库）

---

## 快速开始（新电脑）

```bash
git clone <repo-url>
cd moboost-maas
cp .env.example .env.local       # 填入 OPENROUTER_API_KEY
npm install
npm run dev                       # 访问 http://localhost:3000
```

---

## AI 协作约定

- **对话摘要** 保存在 `docs/sessions/` 目录下
- **架构决策** 记录在 `docs/architecture.md`
- **当前会话状态** 写入 `docs/sessions/latest.md`（每次覆盖）
- 修改核心流程前先读 `src/lib/store.ts` 的接口定义
- 修改 API 路由前注意 Gemini 的 `message.images[]` 格式陷阱
