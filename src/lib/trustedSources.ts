/**
 * Trusted Source Registry — moboost-maas
 * ---------------------------------------------------------------------------
 * 这是 Stage 2 "专家补全" 的权威信源目录。每条目标代表一个在某个垂直领域里
 * 可信、及时、并且已经被人工审核过的来源。
 *
 * 设计原则（ADL 稳定性优先）:
 *   1. 所有条目必须可描述：id / name / url / category / language /
 *      trustLevel / lastReviewed
 *   2. trustLevel ∈ [0,10]，由 xu 或系统 reviewer 给出
 *   3. 条目只能通过 PCEC 周期或显式 review 更新，不能在运行时被污染
 *   4. 每条必须有 lastReviewed 日期，超过一年未复审的条目会在打分时降权
 *
 * 增长路径：
 *   - 本文件目前是 seed（~40 条），xu 可以追加
 *   - 也会被 PCEC 扫描 docs/evolution-log.md 自动生成 diff 建议
 */

export type SourceCategory =
  | 'ad-specs'          // 平台广告规格文档
  | 'marketing-insight' // 行业洞察 / 趋势报告
  | 'creative-trend'    // 创意趋势
  | 'igaming'           // iGaming 垂直
  | 'design-system'     // 设计规范
  | 'copywriting'       // 文案参考
  | 'competitive-intel' // 竞品 / 同行
  | 'regulatory'        // 合规 / 监管
  | 'data-analytics'    // 数据分析
  | 'stock-media'       // 素材库

export type SourceLanguage = 'zh' | 'en' | 'multi'

export interface TrustedSource {
  id: string
  name: string
  url: string
  category: SourceCategory
  language: SourceLanguage
  /** 0-10, 10 = first-party official */
  trustLevel: number
  /** Update cadence in days. Used as a timeliness signal. */
  updateCadenceDays: number
  /** ISO date (YYYY-MM-DD) of last human review by xu or PCEC. */
  lastReviewed: string
  /** 1-2 sentence description in Chinese */
  description: string
  /** Optional: specific vertical tags (e.g. ["sportsbook", "slots"]) */
  tags?: string[]
}

/** Canonical source registry. Keep sorted by category then trustLevel desc. */
export const TRUSTED_SOURCES: TrustedSource[] = [
  // ─── Ad specs (first-party documentation) ─────────────────────────────
  {
    id: 'meta-business-ad-specs',
    name: 'Meta Business Help Center — Ad specs',
    url: 'https://www.facebook.com/business/ads-guide',
    category: 'ad-specs',
    language: 'multi',
    trustLevel: 10,
    updateCadenceDays: 30,
    lastReviewed: '2026-04-07',
    description: 'Meta 官方广告尺寸规范，覆盖 Feed / Reels / Stories 全部版位。',
  },
  {
    id: 'tiktok-ads-manager-specs',
    name: 'TikTok Ads Manager — Creative specs',
    url: 'https://ads.tiktok.com/help/article/tiktok-ads-specs',
    category: 'ad-specs',
    language: 'multi',
    trustLevel: 10,
    updateCadenceDays: 60,
    lastReviewed: '2026-04-07',
    description: 'TikTok 官方广告规格，含视频时长 / 比例 / 码率上限。',
  },
  {
    id: 'youtube-creator-ads-specs',
    name: 'YouTube Ads — Creative specifications',
    url: 'https://support.google.com/google-ads/answer/2375464',
    category: 'ad-specs',
    language: 'multi',
    trustLevel: 10,
    updateCadenceDays: 60,
    lastReviewed: '2026-04-07',
    description: 'YouTube 各版位广告的尺寸 / 时长 / 文件要求。',
  },
  {
    id: 'iab-ad-portfolio',
    name: 'IAB New Ad Portfolio',
    url: 'https://www.iab.com/guidelines/new-ad-portfolio/',
    category: 'ad-specs',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 180,
    lastReviewed: '2026-04-07',
    description: 'IAB 标准展示广告尺寸权威来源（Medium Rectangle、Leaderboard 等）。',
  },
  {
    id: 'linkedin-ad-specs',
    name: 'LinkedIn Ad Specs',
    url: 'https://business.linkedin.com/marketing-solutions/ads/ad-specs',
    category: 'ad-specs',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 90,
    lastReviewed: '2026-04-07',
    description: 'LinkedIn Sponsored Content / Message Ads 的尺寸规范。',
  },
  {
    id: 'x-ads-specs',
    name: 'X (Twitter) Business — Ad specifications',
    url: 'https://business.x.com/en/help/ads-specifications',
    category: 'ad-specs',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 90,
    lastReviewed: '2026-04-07',
    description: 'X 平台 Promoted Tweets / Video Ads 官方规格。',
  },

  // ─── Marketing insight ────────────────────────────────────────────────
  {
    id: 'hootsuite-blog',
    name: 'Hootsuite Social Media Blog',
    url: 'https://blog.hootsuite.com/',
    category: 'marketing-insight',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 3,
    lastReviewed: '2026-04-07',
    description: '高产出的社交媒体趋势与数据报告来源，更新频繁。',
  },
  {
    id: 'sprout-social-insights',
    name: 'Sprout Social Insights',
    url: 'https://sproutsocial.com/insights/',
    category: 'marketing-insight',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 5,
    lastReviewed: '2026-04-07',
    description: '偏 B2B / 品牌运营视角的社交数据洞察。',
  },
  {
    id: 'statista-digital-ads',
    name: 'Statista — Digital Advertising',
    url: 'https://www.statista.com/markets/424/topic/538/advertising/',
    category: 'marketing-insight',
    language: 'en',
    trustLevel: 9,
    updateCadenceDays: 30,
    lastReviewed: '2026-04-07',
    description: '广告市场规模 / 预算占比 / 地区分布等结构化数据。',
  },
  {
    id: 'emarketer',
    name: 'eMarketer / Insider Intelligence',
    url: 'https://www.insiderintelligence.com/',
    category: 'marketing-insight',
    language: 'en',
    trustLevel: 9,
    updateCadenceDays: 7,
    lastReviewed: '2026-04-07',
    description: '数字营销与广告预测权威，付费内容质量高。',
  },
  {
    id: 'digiday',
    name: 'Digiday',
    url: 'https://digiday.com/',
    category: 'marketing-insight',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '每日更新的营销行业新闻，以 case study 见长。',
  },
  {
    id: 'adage',
    name: 'Ad Age',
    url: 'https://adage.com/',
    category: 'marketing-insight',
    language: 'en',
    trustLevel: 9,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '广告行业老牌媒体，报道大型 campaign 与预算动向。',
  },

  // ─── Creative trend ───────────────────────────────────────────────────
  {
    id: 'tiktok-creative-center',
    name: 'TikTok Creative Center',
    url: 'https://ads.tiktok.com/business/creativecenter/',
    category: 'creative-trend',
    language: 'multi',
    trustLevel: 10,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: 'TikTok 官方创意趋势中心，实时热门音乐 / hashtag / 模板。',
    tags: ['short-video', 'trend'],
  },
  {
    id: 'meta-foresight',
    name: 'Meta Foresight',
    url: 'https://www.facebook.com/business/news/insights',
    category: 'creative-trend',
    language: 'multi',
    trustLevel: 9,
    updateCadenceDays: 14,
    lastReviewed: '2026-04-07',
    description: 'Meta 的消费者洞察与创意趋势研究。',
  },
  {
    id: 'think-with-google',
    name: 'Think with Google',
    url: 'https://www.thinkwithgoogle.com/',
    category: 'creative-trend',
    language: 'multi',
    trustLevel: 9,
    updateCadenceDays: 7,
    lastReviewed: '2026-04-07',
    description: 'Google 的营销洞察 / 消费者行为报告，数据质量高。',
  },
  {
    id: 'awwwards',
    name: 'Awwwards',
    url: 'https://www.awwwards.com/',
    category: 'creative-trend',
    language: 'en',
    trustLevel: 7,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '网页设计参考 / 交互趋势，用于 landing page 参考。',
  },
  {
    id: 'dribbble',
    name: 'Dribbble',
    url: 'https://dribbble.com/',
    category: 'creative-trend',
    language: 'en',
    trustLevel: 7,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '视觉设计社区，用于 banner / 视觉风格参考。',
  },

  // ─── iGaming vertical ─────────────────────────────────────────────────
  {
    id: 'igaming-business',
    name: 'iGaming Business',
    url: 'https://www.igamingbusiness.com/',
    category: 'igaming',
    language: 'en',
    trustLevel: 9,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '博彩行业头部媒体，涵盖 sportsbook / casino / 合规动态。',
    tags: ['sportsbook', 'casino', 'regulation'],
  },
  {
    id: 'sbc-news',
    name: 'SBC News',
    url: 'https://sbcnews.co.uk/',
    category: 'igaming',
    language: 'en',
    trustLevel: 9,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: 'Sports Betting Community 行业新闻 / 产品发布。',
    tags: ['sportsbook'],
  },
  {
    id: 'egr-global',
    name: 'EGR Global',
    url: 'https://egr.global/',
    category: 'igaming',
    language: 'en',
    trustLevel: 9,
    updateCadenceDays: 2,
    lastReviewed: '2026-04-07',
    description: 'eGaming Review 深度行业报道 + 年度榜单。',
  },
  {
    id: 'gambling-insider',
    name: 'Gambling Insider',
    url: 'https://www.gamblinginsider.com/',
    category: 'igaming',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 2,
    lastReviewed: '2026-04-07',
    description: 'iGaming 商业情报与 executive interview。',
  },

  // ─── Regulatory ───────────────────────────────────────────────────────
  {
    id: 'uk-gambling-commission',
    name: 'UK Gambling Commission',
    url: 'https://www.gamblingcommission.gov.uk/',
    category: 'regulatory',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 7,
    lastReviewed: '2026-04-07',
    description: '英国博彩监管权威，广告合规红线的第一信源。',
    tags: ['uk', 'sportsbook', 'casino'],
  },
  {
    id: 'mga-malta',
    name: 'Malta Gaming Authority',
    url: 'https://www.mga.org.mt/',
    category: 'regulatory',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 14,
    lastReviewed: '2026-04-07',
    description: 'Malta 监管机构，适用欧洲大部分持牌运营商。',
  },
  {
    id: 'gdpr-official',
    name: 'GDPR.eu',
    url: 'https://gdpr.eu/',
    category: 'regulatory',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 30,
    lastReviewed: '2026-04-07',
    description: '欧盟 GDPR 权威参考，广告数据收集合规必读。',
  },

  // ─── Design system ────────────────────────────────────────────────────
  {
    id: 'material-design',
    name: 'Material Design',
    url: 'https://m3.material.io/',
    category: 'design-system',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 90,
    lastReviewed: '2026-04-07',
    description: 'Google 官方设计规范，移动端 UI 参考首选。',
  },
  {
    id: 'apple-hig',
    name: 'Apple Human Interface Guidelines',
    url: 'https://developer.apple.com/design/human-interface-guidelines/',
    category: 'design-system',
    language: 'en',
    trustLevel: 10,
    updateCadenceDays: 180,
    lastReviewed: '2026-04-07',
    description: 'iOS / macOS 设计规范，iOS 素材合规必查。',
  },

  // ─── Copywriting ──────────────────────────────────────────────────────
  {
    id: 'copyhackers',
    name: 'Copyhackers',
    url: 'https://copyhackers.com/',
    category: 'copywriting',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 7,
    lastReviewed: '2026-04-07',
    description: '转化文案与 landing page 写作教程。',
  },

  // ─── Data analytics ───────────────────────────────────────────────────
  {
    id: 'semrush-trends',
    name: 'Semrush Trends',
    url: 'https://www.semrush.com/trending-websites/',
    category: 'data-analytics',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 7,
    lastReviewed: '2026-04-07',
    description: '行业流量趋势与竞品流量分布，用于选对标网站。',
  },
  {
    id: 'similarweb',
    name: 'Similarweb',
    url: 'https://www.similarweb.com/',
    category: 'data-analytics',
    language: 'en',
    trustLevel: 8,
    updateCadenceDays: 7,
    lastReviewed: '2026-04-07',
    description: '网站流量与用户行为情报，适合竞品分析。',
  },

  // ─── Stock media ──────────────────────────────────────────────────────
  {
    id: 'unsplash',
    name: 'Unsplash',
    url: 'https://unsplash.com/',
    category: 'stock-media',
    language: 'en',
    trustLevel: 7,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '免费高质量图片，CC0 协议可商用。',
  },
  {
    id: 'pexels',
    name: 'Pexels',
    url: 'https://www.pexels.com/',
    category: 'stock-media',
    language: 'en',
    trustLevel: 7,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '免费图片与视频素材，搜索质量好。',
  },
  {
    id: 'pixabay',
    name: 'Pixabay',
    url: 'https://pixabay.com/',
    category: 'stock-media',
    language: 'multi',
    trustLevel: 6,
    updateCadenceDays: 1,
    lastReviewed: '2026-04-07',
    description: '多语种素材库，覆盖图片 / 视频 / 音效。',
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

export function getSourcesByCategory(cat: SourceCategory): TrustedSource[] {
  return TRUSTED_SOURCES.filter((s) => s.category === cat)
}

export function getSourceById(id: string): TrustedSource | undefined {
  return TRUSTED_SOURCES.find((s) => s.id === id)
}

export function getSourcesByTags(tags: string[]): TrustedSource[] {
  const set = new Set(tags.map((t) => t.toLowerCase()))
  return TRUSTED_SOURCES.filter((s) =>
    (s.tags || []).some((t) => set.has(t.toLowerCase())),
  )
}

/** Hosts used by the scorer to decide if a URL originates from a trusted source. */
export const TRUSTED_HOSTS: Map<string, TrustedSource> = (() => {
  const m = new Map<string, TrustedSource>()
  for (const src of TRUSTED_SOURCES) {
    try {
      const host = new URL(src.url).hostname.toLowerCase().replace(/^www\./, '')
      m.set(host, src)
    } catch {
      // ignore malformed seed entries
    }
  }
  return m
})()

export function lookupTrustedSourceByUrl(url: string): TrustedSource | undefined {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    // Direct host match or suffix match (e.g. ads.tiktok.com → tiktok.com)
    if (TRUSTED_HOSTS.has(host)) return TRUSTED_HOSTS.get(host)
    for (const [h, src] of TRUSTED_HOSTS.entries()) {
      if (host.endsWith('.' + h) || host === h) return src
    }
  } catch {
    return undefined
  }
  return undefined
}
