# Moboost AI MAAS — 架构决策文档

## 状态管理：自定义 Event Store

**决策：** 不用 Redux / Zustand / Context，用基于 `useSyncExternalStore` 的自定义 store。

**原因：**
- 项目规模 V1 不需要重型状态管理库
- `useSyncExternalStore` 是 React 18 官方 API，无额外依赖
- Event-based 模式支持跨组件订阅，且背景任务（视频轮询）也能直接更新 store

**实现模式：**
```typescript
let _projects: ProjectRecord[] = []
const listeners = new Set<() => void>()
function emit() { listeners.forEach(fn => fn()) }

export const store = {
  subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) },
  getProjects: () => _projects,
  // ... mutate methods each call emit()
}

// 组件中使用：
function useStoreValue<T>(sel: () => T): T {
  return useSyncExternalStore(store.subscribe, sel, sel)
}
const projects = useStoreValue(store.getProjects)
```

---

## 路由架构：首页 → 工作区跳转

**决策：** 首页不做对话，只做输入 → 创建 project → 立即跳转 `/project/[id]`。

**原因：**
- 用户每次生成都应有持久化 Project，不能只在首页临时状态
- 工作区是独立的 3 列布局，与首页布局完全不同
- 跳转前在 store 里创建好 project + routing job，workspace 页面 mount 后自动检测并启动

**数据流：**
```
Home.handleSubmit()
  → store.createProject(name, userMsg)    // messages: [userMsg]
  → store.addJobToProject(id, job)        // jobs: [{ status: 'routing' }]
  → router.push('/project/' + id)

ProjectWorkspace.useEffect()
  → find job.status === 'routing'
  → setShowRouter(true), setCurrentPrompt(job.prompt)
  → (ModelRouter 动画完成后) callGenerateImage / callGenerateVideo
```

---

## 布局架构：Sidebar 按页面类型显示/隐藏

**决策：** `/project/[id]` 路由隐藏全局 Sidebar，使用 `margin: 0`。

**原因：** 工作区有自己的 80px 左栏（缩略图），同时显示 sidebar 会导致空间挤压且视觉冲突。

**实现：**
```typescript
// Sidebar.tsx
const isWorkspace = /^\/project\/[^/]+$/.test(pathname)
if (isWorkspace) return null

// MainContent.tsx
const isWorkspace = /^\/project\/[^/]+$/.test(pathname)
if (isWorkspace) return <main className="min-h-screen">{children}</main>
```

---

## API 设计：视频生成异步模式

**决策：** 视频提交后立即返回，后台轮询，完成后通过 Notification 告知用户。

**原因：** VEO 3.1 生成需要 ~70 秒，不能阻塞 UI。

**轮询实现：** 在 `store.ts` 里的 `pollVideoJob()` 函数，5s 间隔，最多 30 次（2.5分钟），无论用户在哪个页面都持续运行。

```typescript
export async function pollVideoJob(projectId, jobId, videoJobId, prompt) {
  let attempts = 0
  const interval = setInterval(async () => {
    attempts++
    if (attempts > 30) { clearInterval(interval); return }

    const pollRes = await fetch('/api/generate-video', {
      method: 'POST',
      body: JSON.stringify({ action: 'poll', jobId: videoJobId })
    })
    const data = await pollRes.json()

    if (data.status === 'completed') {
      clearInterval(interval)
      // download → addAsset → notification
    }
  }, 5000)
}
```

---

## Gemini 图片 API 的关键坑

**问题：** 调用 `google/gemini-3-pro-image-preview` 后，图片数据**不在** `message.content` 里。

**实际响应结构：**
```json
{
  "choices": [{
    "message": {
      "content": null,
      "images": [
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
      ]
    }
  }]
}
```

**解决方案（在 `src/app/api/generate/route.ts` 里）：**
```typescript
// 先检查 message.images[]（Gemini 格式）
const images = message.images || []
if (images.length > 0) {
  const imageData = images[0]?.image_url?.url
  const allImages = images.map((img: any) => img?.image_url?.url).filter(Boolean)
  return { imageData, allImages }
}
// 再回退检查 content（其他模型）
```

---

## D1-D4 评估框架

| 维度 | 含义 | 评分重点 |
|------|------|----------|
| D1 规格合规 | 尺寸/格式/平台规范/法规遵守 | 技术可投放性 |
| D2 内容完整性 | 信息是否完整、CTA 是否清晰 | 转化有效性 |
| D3 表达力 | 视觉冲击力、创意、品牌一致性 | 吸引眼球 |
| D4 竞争优势 | 差异化、相对竞品的优势 | 市场竞争力 |

---

## 未来 V2 规划

- **数据持久化：** 接 PostgreSQL / Supabase，替换内存 store
- **用户认证：** Clerk 或 NextAuth
- **真实 ModelRouter：** 根据 brief 内容用 LLM 选模型，而非随机权重
- **Canvas 编辑：** 接 Fabric.js 或 Konva 实现在线图片编辑
- **Batch 生成：** 一次生成多个尺寸变体
- **A/B 测试：** 多版素材对比投放效果
