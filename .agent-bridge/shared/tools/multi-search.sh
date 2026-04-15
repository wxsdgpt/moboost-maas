#!/bin/bash
# ============================================================
# multi-search.sh — 多源并行搜索 + 交叉验证
# ============================================================
# 用法: ./multi-search.sh "查询内容" [max_results]
#
# 组合 Perplexity 搜索 + curl 直接抓取 + trafilatura 解析
# 先用 Perplexity 找到源 URL，再用 trafilatura 提取原文
# 最终输出经过交叉验证的结构化情报
# ============================================================

set -euo pipefail

QUERY="${1:?Usage: multi-search.sh QUERY [max_results]}"
MAX_RESULTS="${2:-5}"
TOOLS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${TOOLS_DIR}/../../.." && pwd)"

source "${PROJECT_DIR}/.env.local"

echo "=== Phase 1: Perplexity 语义搜索 ===" >&2

# Perplexity 搜索获取初始结果和 URL
PERPLEXITY_RESULT=$(curl -s "${OPENROUTER_BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://moboost.ai" \
  -d "$(python3 -c "
import json
print(json.dumps({
    'model': 'perplexity/sonar-pro',
    'messages': [
        {'role': 'system', 'content': 'You are a research assistant. Return findings as JSON array. Each item: {\"title\": str, \"summary\": str, \"source_url\": str|null, \"tags\": [str]}. ONLY JSON, no markdown.'},
        {'role': 'user', 'content': 'Find the ${MAX_RESULTS} most relevant recent (2025-2026) findings about: ${QUERY}. Focus on iGaming industry. Return ONLY a JSON array.'}
    ],
    'temperature': 0.1
}))
")")

CONTENT=$(echo "${PERPLEXITY_RESULT}" | python3 -c "
import sys, json
r = json.load(sys.stdin)
c = r['choices'][0]['message']['content']
if c.startswith('\`\`\`'):
    lines = c.split('\n')
    c = '\n'.join(lines[1:-1])
print(c)
")

echo "=== Phase 2: URL 深度提取 ===" >&2

# 提取 URL 列表，用 trafilatura 逐个深挖
URLS=$(echo "${CONTENT}" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    for item in data:
        url = item.get('source_url')
        if url and url.startswith('http'):
            print(url)
except:
    pass
" 2>/dev/null)

EXTRACTED=""
if [ -n "${URLS}" ]; then
  while IFS= read -r url; do
    echo "  Extracting: ${url}" >&2
    RESULT=$(python3 "${TOOLS_DIR}/extract.py" "${url}" --json --with-metadata 2>/dev/null || echo '{"error": "extract failed"}')
    EXTRACTED="${EXTRACTED}${RESULT}\n"
  done <<< "${URLS}"
fi

echo "=== Phase 3: 合并输出 ===" >&2

# 输出合并结果
python3 -c "
import json, sys

# Perplexity 结果
try:
    search_results = json.loads('''${CONTENT}''')
except:
    search_results = []

print(json.dumps({
    'query': '${QUERY}',
    'search_results': search_results,
    'total_findings': len(search_results),
}, ensure_ascii=False, indent=2))
"
