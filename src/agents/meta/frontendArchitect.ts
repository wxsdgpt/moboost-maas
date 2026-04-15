/**
 * Frontend Architect Agent — 前端层Architect
 * ============================================
 *
 * Responsibilities:
 *   - Generate UI components following the Apple DESIGN.md system
 *   - Design page layouts and navigation flows
 *   - Create React/Next.js page code
 *   - Ensure accessibility and responsive design
 *   - Output production-ready TSX code
 *
 * Input: Feature description + UI requirements
 * Output: React component code + page structure + routing config
 */

import { AgentDefinition, AgentContext, AgentMetrics } from '../types'
import { MetaAgent, callLLM, getDesignSystemContext } from './base'

// ─── Agent Definition ─────────────────────────────────────────────────

const DEFINITION: AgentDefinition = {
  id: 'frontend-architect',
  nameZh: '前端层Architect',
  nameEn: 'Frontend Architect Agent',
  category: 'meta',
  status: 'active',
  version: '1.0.0',
  systemPrompt: '',
  tools: [
    {
      name: 'generate_component',
      description: '生成React组件',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '组件名' },
          description: { type: 'string', description: '功能描述' },
          props: { type: 'object', description: 'Props定义' },
        },
        required: ['name', 'description'],
      },
      handler: 'src/agents/meta/frontendArchitect#generateComponent',
    },
    {
      name: 'generate_page',
      description: '生成Next.js页面',
      parameters: {
        type: 'object',
        properties: {
          route: { type: 'string', description: '路由路径' },
          description: { type: 'string', description: '页面描述' },
          dataSource: { type: 'string', description: '数据来源API' },
        },
        required: ['route', 'description'],
      },
      handler: 'src/agents/meta/frontendArchitect#generatePage',
    },
  ],
  dependencies: ['data-architect'],
  capabilities: ['component-generation', 'page-design', 'layout-system', 'responsive-design', 'design-system'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  origin: 'human',
}

// ─── Current UI Inventory ─────────────────────────────────────────────

const UI_INVENTORY = `当前前端页面和组件：

## 页面 (src/app/)
- / — 首页（欢迎Banner + 快捷操作）
- /brief/new — Brief创建（Stage 1: 输入）
- /brief/chat — Brief对话（自然语言Agent交互）
- /brief/execute — Brief执行（并行3组 → 图片/视频生成 → 落地页代码流）
- /project — 项目管理
- /report — 报告查看
- /evolution — Evolution Agent控制台
- /onboarding — 新用户引导
- /login, /sign-in, /sign-up — 认证页面
- /reset — 管理员数据重置
- /tools — 工具面板
- /specs — 素材规格

## 组件 (src/components/)
- Sidebar.tsx — 侧边导航栏
- WelcomeBanner.tsx — 首页欢迎区
- CreditBalance.tsx — 积分余额显示
- ModelRouter.tsx — 模型选择可视化
- ThinkingPanel.tsx — Agent思考过程面板
- SpecValidationBadge.tsx — 规格验证徽章
- ParticleFlow.tsx — 3D粒子动效(Three.js)
- Notifications.tsx — 通知组件

## 布局
- 左侧Sidebar固定 + 右侧主内容区
- 条件渲染: /admin和/reset路径跳过ClerkProvider/Sidebar
- 主题支持: ThemeProvider + themeStore`

// ─── Implementation ───────────────────────────────────────────────────

class FrontendArchitectAgent extends MetaAgent {
  definition = DEFINITION

  protected async run(ctx: AgentContext): Promise<{
    outputs: Record<string, unknown>
    summary: string
    metrics: Partial<AgentMetrics>
  }> {
    const requirement = ctx.params.requirement as string
    if (!requirement) {
      throw new Error('Missing required parameter: requirement (前端需求描述)')
    }

    const outputType = (ctx.params.outputType as string) || 'page' // 'page' | 'component' | 'layout'
    const designSystem = getDesignSystemContext()

    const result = await callLLM([
      {
        role: 'system',
        content: `你是 Moboost AI MaaS 平台的前端架构师Agent。
你根据需求生成符合Apple设计系统规范的Next.js 14 (App Router) + TypeScript代码。

# 设计系统
${designSystem}

# 当前前端资产
${UI_INVENTORY}

# 编码规范
1. 使用 'use client' 指令用于包含hooks/事件处理的组件
2. 使用 Tailwind CSS classes（内联，不创建单独CSS文件）
3. 图标统一用 lucide-react
4. 数据fetching使用 fetch() + useState/useEffect（不用SWR/React Query）
5. 表单使用 受控组件模式
6. 类型放在文件顶部的 interface 块中
7. 组件文件使用 PascalCase，页面文件用 page.tsx
8. 中文界面（标签、按钮、提示等都用中文）
9. 统一使用 -apple-system 字体栈
10. 响应式：默认桌面优先，关键页面支持移动端

# 输出格式（严格JSON）
\`\`\`json
{
  "analysis": "需求分析和设计决策",
  "files": [
    {
      "path": "src/app/xxx/page.tsx 或 src/components/Xxx.tsx",
      "type": "page|component|layout|api",
      "description": "文件作用",
      "code": "完整的TypeScript/TSX代码",
      "dependencies": ["需要import的外部库"]
    }
  ],
  "routing": {
    "newRoutes": ["/path — 描述"],
    "modifiedRoutes": ["修改说明"]
  },
  "dataFlow": "数据流向说明（API → State → UI）",
  "interactions": ["交互说明"],
  "responsive": "响应式策略"
}
\`\`\`

生成的代码必须是完整、可直接使用的，不要用占位符或省略号。`,
      },
      {
        role: 'user',
        content: `输出类型: ${outputType}\n\n需求:\n${requirement}`,
      },
    ], {
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 8000,
    })

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(result.content)
    } catch {
      parsed = { raw: result.content, parseError: true }
    }

    const files = parsed.files as Array<Record<string, unknown>> | undefined
    const fileCount = files?.length || 0
    const totalCodeLines = files?.reduce((sum, f) => {
      const code = f.code as string || ''
      return sum + code.split('\n').length
    }, 0) || 0

    return {
      outputs: parsed,
      summary: `前端架构设计完成：${fileCount}个文件，约${totalCodeLines}行代码。${(parsed.routing as Record<string, unknown[]>)?.newRoutes?.length || 0}条新路由`,
      metrics: {
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        llmCalls: 1,
        modelUsed: result.model,
      },
    }
  }
}

export const frontendArchitect = new FrontendArchitectAgent()
