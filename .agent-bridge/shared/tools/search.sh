#!/bin/bash
# ============================================================
# search.sh — Perplexity Sonar Pro 语义搜索
# ============================================================
# 用法: ./search.sh "查询内容" [category] [vertical]
# 输出: JSON (KnowledgeEntry 格式)
#
# 最强搜索层：AI 语义搜索 + 实时网络 + 源引用
# 适合：竞品调研、趋势分析、法规查询、技术发现
# ============================================================

set -euo pipefail

QUERY="${1:?Usage: search.sh QUERY [category] [vertical]}"
CATEGORY="${2:-trend}"
VERTICAL="${3:-}"

# 加载环境
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
source "${PROJECT_DIR}/.env.local"

OPENROUTER_BASE="${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}"
MODEL="perplexity/sonar-pro"

SYSTEM_PROMPT="You are a senior research analyst for Moboost AI, an iGaming Marketing-as-a-Service platform.

Your task: Find the most recent, actionable intelligence about the given topic.

RULES:
1. Focus on 2025-2026 data only
2. Include specific company names, numbers, dates
3. Cite source URLs wherever possible
4. Structure your response as a JSON array of findings

Return a JSON array where each item has:
{
  \"title\": \"Concise finding title\",
  \"summary\": \"≤300 char summary with key facts\",
  \"source_url\": \"URL or null\",
  \"confidence\": 0.0-1.0,
  \"relevance\": 0.0-1.0,
  \"tags\": [\"tag1\", \"tag2\"]
}

Return ONLY the JSON array. No markdown, no explanation."

USER_PROMPT="Search query: ${QUERY}
Category: ${CATEGORY}
${VERTICAL:+Vertical: ${VERTICAL}}

Find 3-8 relevant findings. Focus on iGaming industry context."

RESPONSE=$(curl -s "${OPENROUTER_BASE}/chat/completions" \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://moboost.ai" \
  -H "X-Title: Moboost Intelligence" \
  -d "$(python3 -c "
import json, sys
print(json.dumps({
    'model': '${MODEL}',
    'messages': [
        {'role': 'system', 'content': $(python3 -c "import json; print(json.dumps('''${SYSTEM_PROMPT}'''))")},
        {'role': 'user', 'content': $(python3 -c "import json; print(json.dumps('''${USER_PROMPT}'''))")}
    ],
    'temperature': 0.1
}))
")")

# 提取 content
echo "${RESPONSE}" | python3 -c "
import sys, json
try:
    r = json.load(sys.stdin)
    content = r['choices'][0]['message']['content']
    # 尝试清理 markdown 包裹
    if content.startswith('\`\`\`'):
        lines = content.split('\n')
        content = '\n'.join(lines[1:-1])
    print(content)
except Exception as e:
    print(json.dumps({'error': str(e), 'raw': r}), file=sys.stderr)
    sys.exit(1)
"
