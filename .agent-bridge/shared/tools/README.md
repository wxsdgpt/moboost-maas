# OpenClaw 情报采集工具包

> 项目路径: `~/moboost AI/moboost-maas/.agent-bridge/shared/tools/`

## 能力矩阵

| 工具 | 速度 | 深度 | JS渲染 | 适用场景 |
|------|------|------|--------|----------|
| **Perplexity** (search.sh) | ⚡ 3-5s | ★★★★★ | N/A | 语义搜索、竞品调研、趋势、法规 |
| **Playwright** (crawl.js) | 🐢 5-15s | ★★★★★ | ✅ | SPA、广告库、截图、动态页面 |
| **trafilatura** (extract.py) | ⚡ 1-3s | ★★★☆☆ | ❌ | 文章正文、批量URL、新闻、博客 |
| **curl** (内置) | ⚡⚡ <1s | ★★☆☆☆ | ❌ | API、RSS、简单HTML |
| **multi-search.sh** | 🐢 15-30s | ★★★★★ | ✅ | 多源交叉验证 |

## 使用方法

### 1. Perplexity 语义搜索（首选）
```bash
# 直接在 OpenClaw 中通过 curl 调用 OpenRouter
source ~/moboost\ AI/moboost-maas/.env.local
curl -s "${OPENROUTER_BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"perplexity/sonar-pro","messages":[...]}'
```

### 2. Playwright 深度爬取
```bash
cd ~/moboost\ AI/moboost-maas
node .agent-bridge/shared/tools/crawl.js "https://target-url.com"
# 带截图:
node .agent-bridge/shared/tools/crawl.js "https://target-url.com" --screenshot /path/to/output.png
```

### 3. trafilatura 正文提取
```bash
python3 ~/moboost\ AI/moboost-maas/.agent-bridge/shared/tools/extract.py \
  "https://article-url.com" --json --with-metadata
# 批量:
python3 extract.py url1 url2 url3 --json
```

## 选择策略

```
需要什么？
├── 搜索某个话题 → Perplexity (最强)
├── 爬取特定页面
│   ├── 静态文章/博客 → trafilatura (最快)
│   └── JS渲染/SPA/截图 → Playwright (最全)
├── 批量处理多URL → trafilatura
└── 深度调研 → Perplexity 找URL → trafilatura 批量提取
```

## 环境依赖

- Node.js v22 ✅
- Python 3.9 ✅
- Playwright 1.59.1 + Chrome ✅
- trafilatura + beautifulsoup4 + httpx ✅
- OpenRouter API Key (Perplexity) ✅
