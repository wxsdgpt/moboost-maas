# OpenClaw 搜索与爬虫能力建设方案

> 目标：让 OpenClaw 成为 Moboost 自进化系统最强的"眼睛"

## 当前能力审计

| 能力层 | 工具 | 状态 | 能力 |
|--------|------|------|------|
| L0-基础HTTP | curl / exec | ✅ 可用 | 获取原始 HTML，无渲染 |
| L1-搜索LLM | Perplexity via OpenRouter | ✅ 有key | 语义搜索 + 摘要，无原始页面 |
| L2-浏览器渲染 | Playwright + Chrome | ✅ 已装 | JS渲染、SPA、截图、PDF |
| L3-HTML解析 | python3 + jq | ⚠️ 缺库 | 需装 beautifulsoup4/trafilatura |
| L4-搜索API | SerpAPI/Brave/Tavily | ❌ 无key | 无 |
| L5-RSS/Feed | 无 | ❌ 未建 | 需开发 |
| L6-社交监控 | 无 | ❌ 未建 | Reddit/Twitter 监听 |

## 5层能力建设路线

### 第1层：智能搜索（最高优先）
**Perplexity Sonar Pro + OpenRouter** — 已有代码和 key

OpenClaw 直接通过 OpenRouter 调 perplexity/sonar-pro：
- 实时网络搜索 + AI 总结
- 带源引用（URL + 标题）
- ~3-5秒/查询
- 不需要浏览器

### 第2层：深度爬取（高优先）
**Playwright headless Chrome** — 已装 v1.59.1 + Chrome

适用场景：
- 竞品官网 JS 渲染页面
- 需要截图取证的内容
- SPA / 动态加载页面
- Facebook/Meta 广告库

### 第3层：高效解析（中优先）
**Python: trafilatura + beautifulsoup4** — 需安装

适用场景：
- 快速提取文章正文（去导航/广告/脚注）
- 批量处理多个 URL
- 比 Playwright 快 10x

### 第4层：搜索API（可选）
**Brave Search API** — 免费额度，需申请
- 1000次/月免费
- 返回结构化搜索结果
- 用于补充 Perplexity 的盲区

### 第5层：定向监控（后续）
- RSS Feed 聚合器
- Reddit iGaming 子版监控
- Google Alerts 替代
