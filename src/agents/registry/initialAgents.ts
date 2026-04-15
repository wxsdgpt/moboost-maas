/**
 * Initial Agent Definitions
 * ===========================
 *
 * Pre-registered agent definitions for V1 business agents.
 * These map to existing functionality in the codebase:
 *   - copywriter  → brief/execute text generation logic
 *   - designer    → /api/generate-image, /api/generate-video
 *   - competitor-radar → /api/competitor-analysis, market intel
 *   - compliance  → fake rule-based checker (V1)
 *   - localizer   → placeholder for V2
 *
 * The Evolution Agent observes these agents and proposes changes.
 */

import { AgentDefinition } from '../types'

const now = new Date().toISOString()

export const INITIAL_AGENTS: AgentDefinition[] = [
  // ─── Business Agents ────────────────────────────────────────────

  {
    id: 'copywriter',
    nameZh: '文案Agent',
    nameEn: 'Copywriter Agent',
    category: 'business',
    status: 'active',
    version: '1.0.0',
    systemPrompt: `你是 Moboost AI 的广告文案专家。根据Brief要求、产品信息和目标受众，生成高转化率的iGaming广告文案。

要求：
- 文案需符合目标地区的文化习惯和法规要求
- 包含明确的CTA（Call to Action）
- 标题要抓眼球，正文要简洁有力
- 避免虚假宣传用语（如"guaranteed wins"、"必赢"等）
- 支持多语言输出

输出格式：
- headline: 主标题（≤15字）
- subheadline: 副标题（≤25字）
- body: 正文（≤100字）
- cta: CTA按钮文案（≤8字）
- hashtags: 3-5个相关标签`,
    tools: [
      {
        name: 'generate_copy',
        description: '生成广告文案',
        parameters: {
          type: 'object',
          properties: {
            brief: { type: 'string', description: '广告Brief描述' },
            audience: { type: 'string', description: '目标受众' },
            tone: { type: 'string', description: '文案调性' },
            language: { type: 'string', description: '输出语言' },
          },
          required: ['brief'],
        },
        handler: 'src/agents/tools/copywriter',
      },
      {
        name: 'generate_variants',
        description: '生成A/B测试变体',
        parameters: {
          type: 'object',
          properties: {
            baseCopy: { type: 'string' },
            variantCount: { type: 'number', default: 3 },
          },
          required: ['baseCopy'],
        },
        handler: 'src/agents/tools/copywriter',
      },
    ],
    dependencies: ['competitor-radar'],
    capabilities: ['text-generation', 'copywriting', 'ab-testing', 'multilingual'],
    model: undefined, // uses default AGENT_MODEL
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'designer',
    nameZh: '设计Agent',
    nameEn: 'Designer Agent',
    category: 'business',
    status: 'active',
    version: '1.0.0',
    systemPrompt: `你是 Moboost AI 的视觉设计专家。根据Brief要求和文案Agent的输出，生成高质量的广告素材。

能力：
- 图片生成（通过 Gemini 3 Pro Image）
- 视频生成（通过 VEO 3.1）
- 素材规格适配（Instagram Feed/Story/Reel, TikTok, Facebook 等）

设计原则：
- 视觉层次清晰，主信息突出
- 品牌色彩一致性
- CTA按钮醒目
- 符合各平台的尺寸和安全区要求`,
    tools: [
      {
        name: 'generate_image',
        description: '生成广告图片',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            width: { type: 'number' },
            height: { type: 'number' },
            style: { type: 'string' },
          },
          required: ['prompt'],
        },
        handler: 'src/lib/openrouter#generateImage',
      },
      {
        name: 'generate_video',
        description: '生成广告视频',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            duration: { type: 'number', description: '秒数' },
          },
          required: ['prompt'],
        },
        handler: 'src/lib/openrouter#generateVideo',
      },
    ],
    dependencies: ['copywriter'],
    capabilities: ['image-generation', 'video-generation', 'spec-adaptation', 'visual-design'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'competitor-radar',
    nameZh: '竞品分析雷达Agent',
    nameEn: 'Competitor Radar Agent',
    category: 'business',
    status: 'active',
    version: '1.0.0',
    systemPrompt: `你是 Moboost AI 的竞品情报分析专家。负责：
1. 分析竞品广告素材的创意方向、视觉风格、文案策略
2. 识别行业趋势和热门创意模式
3. 评估竞品投放策略（渠道、频次、受众定向）
4. 为文案Agent和设计Agent提供竞争情报输入

分析维度：
- 视觉风格：色彩、排版、图片类型
- 文案策略：关键卖点、情感诉求、CTA类型
- 投放特征：渠道分布、时段偏好、地域策略
- 创新发现：新的创意方向和差异化机会`,
    tools: [
      {
        name: 'analyze_competitor',
        description: '分析竞品广告素材',
        parameters: {
          type: 'object',
          properties: {
            url: { type: 'string', description: '竞品页面URL' },
            images: { type: 'array', items: { type: 'string' } },
          },
          required: [],
        },
        handler: 'src/lib/marketIntel/syncRunner',
      },
      {
        name: 'search_market_trends',
        description: '搜索市场趋势',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            market: { type: 'string' },
            period: { type: 'string' },
          },
          required: ['category'],
        },
        handler: 'src/lib/sourceSearch',
      },
    ],
    dependencies: [],
    capabilities: ['competitor-analysis', 'market-intel', 'trend-detection', 'creative-analysis'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'compliance',
    nameZh: '风控合规Agent',
    nameEn: 'Compliance Agent',
    category: 'business',
    status: 'active',
    version: '0.1.0', // V0.1 = fake/rule-based
    systemPrompt: `[FAKE V1] 基于规则的合规检查器。
检查项：
- 年龄限制声明（18+/21+）
- 虚假宣传用语过滤
- 负责任博彩声明
- 地区牌照信息注入
- 禁用词检测

注意：V1版本仅使用正则匹配和规则库，不调用LLM。`,
    tools: [
      {
        name: 'check_compliance',
        description: '检查内容合规性',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            market: { type: 'string' },
            contentType: { type: 'string', enum: ['copy', 'image', 'video', 'landing'] },
          },
          required: ['content', 'market'],
        },
        handler: 'src/agents/tools/compliance',
      },
    ],
    dependencies: ['copywriter', 'designer'],
    capabilities: ['compliance-check', 'age-restriction', 'gambling-disclaimer', 'regional-rules'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'localizer',
    nameZh: '本地化Agent',
    nameEn: 'Localizer Agent',
    category: 'business',
    status: 'experimental',
    version: '0.1.0',
    systemPrompt: `你是 Moboost AI 的本地化专家。负责：
1. 将广告文案翻译到目标市场语言
2. 进行文化适配（非直译）
3. 调整视觉元素（颜色偏好、排版方向等）
4. 确保本地化后的内容符合当地法规

支持市场：
- 巴西（葡语）、东南亚（英/越/泰/印尼）、印度（英/印地）
- 拉美（西语）、日韩（日/韩）、欧洲（英/德/法/西）`,
    tools: [
      {
        name: 'translate_and_adapt',
        description: '翻译并文化适配',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            sourceLanguage: { type: 'string' },
            targetLanguage: { type: 'string' },
            market: { type: 'string' },
          },
          required: ['content', 'targetLanguage'],
        },
        handler: 'src/agents/tools/localizer',
      },
    ],
    dependencies: ['copywriter', 'compliance'],
    capabilities: ['translation', 'cultural-adaptation', 'rtl-support', 'regional-tone'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  // ─── Evolution Agent (self-reference) ───────────────────────────

  {
    id: 'evolution',
    nameZh: '进化Agent',
    nameEn: 'Evolution Agent',
    category: 'evolution',
    status: 'active',
    version: '1.0.0',
    systemPrompt: `你是 Moboost AI 平台的 Evolution Agent（进化Agent）。
你的职责是观察所有其他Agent的行为和数据，判断：
1. 是否需要补充新的能力
2. 是否需要进化现有Agent
3. 是否需要合并冗余Agent
4. 是否需要分裂出新的专项Agent

决策原则：
- 找到最优解，而不是最快解
- 基于数据驱动，不做主观臆断
- 高风险决策必须经过人类审核
- 低风险调优可以自动执行

你维护整个Agent生态系统的健康和进化。`,
    tools: [],
    dependencies: [],
    capabilities: ['observation', 'diagnosis', 'evolution-planning', 'system-health'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  // ─── Meta Agents (平台建设) ─────────────────────────────────────

  {
    id: 'data-architect',
    nameZh: '数据层Architect',
    nameEn: 'Data Architect Agent',
    category: 'meta',
    status: 'active',
    version: '1.0.0',
    systemPrompt: '数据架构设计Agent — 根据业务需求设计和演化数据模型，生成Supabase migration SQL和TypeScript类型定义。',
    tools: [
      { name: 'read_current_schema', description: '读取当前数据库schema', parameters: {}, handler: 'src/agents/meta/dataArchitect' },
      { name: 'generate_migration', description: '生成SQL migration', parameters: { type: 'object', properties: { requirement: { type: 'string' } }, required: ['requirement'] }, handler: 'src/agents/meta/dataArchitect' },
      { name: 'generate_types', description: '生成TypeScript类型', parameters: { type: 'object', properties: { tableName: { type: 'string' } }, required: ['tableName'] }, handler: 'src/agents/meta/dataArchitect' },
    ],
    dependencies: [],
    capabilities: ['schema-design', 'migration-generation', 'type-generation', 'index-optimization', 'fk-validation'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'engine-architect',
    nameZh: '引擎层Architect',
    nameEn: 'Engine Architect Agent',
    category: 'meta',
    status: 'active',
    version: '1.0.0',
    systemPrompt: '生成引擎架构Agent — 管理模型路由和生成管线，评估新模型接入，设计pipeline编排。',
    tools: [
      { name: 'analyze_pipeline', description: '分析当前生成管线', parameters: {}, handler: 'src/agents/meta/engineArchitect' },
      { name: 'design_pipeline', description: '设计新管线', parameters: { type: 'object', properties: { requirement: { type: 'string' } }, required: ['requirement'] }, handler: 'src/agents/meta/engineArchitect' },
      { name: 'evaluate_model', description: '评估模型能力', parameters: { type: 'object', properties: { taskType: { type: 'string' } }, required: ['taskType'] }, handler: 'src/agents/meta/engineArchitect' },
    ],
    dependencies: [],
    capabilities: ['model-routing', 'pipeline-design', 'model-evaluation', 'api-integration', 'cost-optimization'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'frontend-architect',
    nameZh: '前端层Architect',
    nameEn: 'Frontend Architect Agent',
    category: 'meta',
    status: 'active',
    version: '1.0.0',
    systemPrompt: '前端架构Agent — 根据需求生成符合Apple设计系统的Next.js组件和页面代码。',
    tools: [
      { name: 'generate_component', description: '生成React组件', parameters: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name', 'description'] }, handler: 'src/agents/meta/frontendArchitect' },
      { name: 'generate_page', description: '生成Next.js页面', parameters: { type: 'object', properties: { route: { type: 'string' }, description: { type: 'string' } }, required: ['route', 'description'] }, handler: 'src/agents/meta/frontendArchitect' },
    ],
    dependencies: ['data-architect'],
    capabilities: ['component-generation', 'page-design', 'layout-system', 'responsive-design', 'design-system'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },

  {
    id: 'agent-definer',
    nameZh: 'Agent定义Agent',
    nameEn: 'Agent Definition Agent',
    category: 'meta',
    status: 'active',
    version: '1.0.0',
    systemPrompt: 'Meta Agent中的Meta Agent — 根据自然语言描述设计完整的Agent定义，包括system prompt、工具集、依赖关系、能力标签。',
    tools: [
      { name: 'define_agent', description: '定义新Agent', parameters: { type: 'object', properties: { description: { type: 'string' } }, required: ['description'] }, handler: 'src/agents/meta/agentDefiner' },
      { name: 'validate_agent_config', description: '验证Agent配置', parameters: { type: 'object', properties: { config: { type: 'object' } }, required: ['config'] }, handler: 'src/agents/meta/agentDefiner' },
      { name: 'list_current_agents', description: '列出当前Agent', parameters: {}, handler: 'src/agents/meta/agentDefiner' },
    ],
    dependencies: [],
    capabilities: ['agent-creation', 'prompt-engineering', 'tool-design', 'dependency-analysis', 'config-validation'],
    createdAt: now,
    updatedAt: now,
    origin: 'human',
  },
]
