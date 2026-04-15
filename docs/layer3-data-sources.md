# Layer 3 — 数据源接入计划

## 当前状态

| Layer | 状态 | 数据源 | 说明 |
|-------|------|--------|------|
| Layer 1 | ✅ 已完成 | Product Enrichment (URL scrape + LLM) | 用户产品信息自动采集 |
| Layer 2 | ✅ 已完成 | Insightrackr (scraped fixtures) | 5个品牌、3749个素材的竞品数据 |
| Layer 3 | 🔲 准备中 | 见下方 | 更深层次的市场情报 |

## Layer 3 数据源分类

### A. 免费可用（Demo阶段优先接入）

#### 1. Meta Ad Library API
- **状态**: 待接入
- **API**: `https://www.facebook.com/ads/library/api/`
- **费用**: 免费（需Meta开发者账号）
- **提供数据**: 竞品在Facebook/Instagram的活跃广告、广告文案、投放地区
- **价值**: 直接看到竞品在社交渠道的广告策略
- **接入工作量**: ~4小时
- **环境变量**: `META_AD_LIBRARY_TOKEN`

#### 2. Google Play / App Store 数据
- **状态**: 待接入
- **工具**: google-play-scraper (npm), iTunes Lookup API
- **费用**: 免费
- **提供数据**: 应用评分、下载量估算、用户评论、应用描述
- **价值**: 了解竞品App表现和用户反馈
- **接入工作量**: ~3小时
- **无需API Key**

#### 3. YouTube Data API v3
- **状态**: 待接入
- **API**: `https://www.googleapis.com/youtube/v3/`
- **费用**: 免费（每日10,000 units配额）
- **提供数据**: 竞品YouTube频道数据、视频观看量、互动率
- **价值**: 了解视频营销表现
- **接入工作量**: ~2小时
- **环境变量**: `YOUTUBE_API_KEY`

#### 4. Tranco Domain Ranking
- **状态**: 待接入
- **数据源**: https://tranco-list.eu/
- **费用**: 免费（CC BY 4.0）
- **提供数据**: 综合域名排名（融合Alexa/Umbrella/Majestic/Quantcast）
- **价值**: 粗略的流量对比参考
- **接入工作量**: ~2小时
- **无需API Key**

#### 5. Google Trends
- **状态**: 待接入
- **工具**: google-trends-api (npm)
- **费用**: 免费
- **提供数据**: 关键词搜索趋势、地区热度、相关查询
- **价值**: 了解品牌和品类的搜索热度变化
- **接入工作量**: ~2小时
- **无需API Key**

### B. 付费数据源（正式版接入）

#### 1. SimilarWeb
- **API**: `https://api.similarweb.com/`
- **费用**: ~$500+/月 (Enterprise)
- **提供数据**: 月访问量、流量来源、受众画像、地理分布、竞品流量对比
- **价值**: 最全面的网站流量情报
- **环境变量**: `SIMILARWEB_API_KEY`

#### 2. SpyFu / SEMrush
- **API**: SpyFu API 或 SEMrush API
- **费用**: ~$100-400/月
- **提供数据**: 付费关键词、广告文案历史、竞品SEM策略
- **价值**: 搜索营销竞品分析
- **环境变量**: `SPYFU_API_KEY`

#### 3. AppFollow
- **API**: `https://api.appfollow.io/`
- **费用**: ~$100+/月
- **提供数据**: 完整的App Store Intelligence（ASO、评论分析、竞品对比）
- **价值**: 深度App营销数据
- **环境变量**: `APPFOLLOW_API_KEY`

#### 4. SocialBlade
- **费用**: ~$30/月 (API access)
- **提供数据**: 社交媒体增长率、粉丝趋势、预估收入
- **价值**: 社交渠道表现对比
- **环境变量**: `SOCIALBLADE_API_KEY`

## 接入架构

所有Layer 3数据源通过统一的 `MarketIntelProvider` 接口接入：

```
syncRunner.ts
  └── pickPrimary()
       ├── InsightrackrProvider (Layer 2 API)
       ├── InsightrackrScrapedProvider (Layer 2 scraped)
       ├── Layer3CompositeProvider (合并多个免费源)
       └── MockMarketIntelProvider (fallback)
```

代码位置: `src/lib/marketIntel/providers/layer3.ts`

## 接入优先级

1. **Meta Ad Library** — 最直接的竞品广告数据，免费
2. **App Store数据** — 无需API Key，立即可用
3. **Google Trends** — 搜索趋势，无需API Key
4. **YouTube API** — 视频营销数据
5. **Tranco Ranking** — 流量排名参考

## Demo阶段行动项

- [ ] 注册Meta开发者账号，获取Ad Library token
- [ ] 安装 google-play-scraper: `npm i google-play-scraper`
- [ ] 实现 MetaAdLibraryProvider.fetchVerticalIntel()
- [ ] 实现 AppStoreIntelProvider.fetchVerticalIntel()
- [ ] 创建 Layer3CompositeProvider 合并多个免费源
- [ ] 更新 syncRunner 的 pickPrimary() 链
- [ ] 测试: 每个 provider 独立 + 合并后的数据质量
