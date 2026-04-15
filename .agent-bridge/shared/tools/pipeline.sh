#!/bin/bash
# ============================================================
# pipeline.sh — 一键情报采集流水线
# ============================================================
# 用法: ./pipeline.sh "搜索查询" [category] [vertical]
#
# 流程: Perplexity搜索 → trafilatura提取 → MiniMax处理 → Supabase入库
#
# 示例:
#   ./pipeline.sh "Optimove product updates 2026" competitor Casino
#   ./pipeline.sh "iGaming AI marketing trends" trend
#   ./pipeline.sh "sports betting regulation Europe 2026" regulation "Sports Betting"
# ============================================================

set -euo pipefail

QUERY="${1:?Usage: pipeline.sh QUERY [category] [vertical]}"
CATEGORY="${2:-trend}"
VERTICAL="${3:-}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RUN_ID="${TIMESTAMP}-$(echo "${QUERY}" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-30)"

# 路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
BRIDGE_DIR="${PROJECT_DIR}/.agent-bridge"
INBOX_DIR="${BRIDGE_DIR}/inbox/${RUN_ID}"
LOG_FILE="${BRIDGE_DIR}/logs/$(date +%Y-%m-%d).jsonl"

source "${PROJECT_DIR}/.env.local"

mkdir -p "${INBOX_DIR}" "$(dirname "${LOG_FILE}")"

echo "🔍 Pipeline started: ${RUN_ID}" >&2
echo "   Query: ${QUERY}" >&2
echo "   Category: ${CATEGORY} | Vertical: ${VERTICAL:-all}" >&2

# ─── Phase 1: Perplexity 搜索 ─────────────────────────────────
echo "⏳ Phase 1: Perplexity 搜索..." >&2

SEARCH_RESULT=$(curl -s "${OPENROUTER_BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://moboost.ai" \
  -d "$(python3 -c "
import json
q = '''${QUERY}'''
cat = '${CATEGORY}'
vert = '${VERTICAL}'
print(json.dumps({
    'model': 'perplexity/sonar-pro',
    'max_tokens': 4096,
    'messages': [
        {'role': 'system', 'content': 'You are a senior iGaming industry analyst. Search the web and return findings as a JSON array. Each item must have: title (str), summary (str, ≤300 chars), source_url (str or null), tags (str array). Return ONLY valid JSON array, no markdown wrapping.'},
        {'role': 'user', 'content': f'Find 5-10 recent (2025-2026) findings about: {q}\nCategory: {cat}\n' + (f'Vertical: {vert}\n' if vert else '') + 'Focus on iGaming industry. Include specific companies, numbers, dates. Return ONLY JSON array.'}
    ],
    'temperature': 0.1
}))
")")

# 提取搜索内容
SEARCH_CONTENT=$(echo "${SEARCH_RESULT}" | python3 -c "
import sys, json
r = json.load(sys.stdin)
c = r['choices'][0]['message']['content']
# 去 markdown 包裹
if c.strip().startswith('\`\`\`'):
    lines = c.strip().split('\n')
    c = '\n'.join(lines[1:-1])
print(c)
")

echo "${SEARCH_CONTENT}" > "${INBOX_DIR}/search-raw.json"

# 提取 URL 列表
URLS=$(echo "${SEARCH_CONTENT}" | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    seen = set()
    for item in data:
        url = item.get('source_url')
        if url and url.startswith('http') and url not in seen:
            seen.add(url)
            print(url)
except Exception as e:
    print(f'PARSE_ERROR: {e}', file=sys.stderr)
" 2>/dev/null)

URL_COUNT=$(echo "${URLS}" | grep -c 'http' || echo 0)
echo "✅ Phase 1 完成: 找到 ${URL_COUNT} 个源 URL" >&2

# ─── Phase 2: trafilatura 深度提取 ─────────────────────────────
echo "⏳ Phase 2: 深度提取源页面..." >&2

EXTRACTED_FILE="${INBOX_DIR}/extracted.jsonl"
EXTRACT_COUNT=0

if [ -n "${URLS}" ] && [ "${URL_COUNT}" -gt 0 ]; then
  while IFS= read -r url; do
    if [ -z "${url}" ] || [[ ! "${url}" == http* ]]; then continue; fi
    echo "   📄 ${url}" >&2
    # trafilatura 提取，超时15秒
    RESULT=$(timeout 15 python3 "${SCRIPT_DIR}/extract.py" "${url}" --json --with-metadata 2>/dev/null || echo "{\"url\":\"${url}\",\"error\":\"extract_timeout\"}")
    echo "${RESULT}" >> "${EXTRACTED_FILE}"
    EXTRACT_COUNT=$((EXTRACT_COUNT + 1))
  done <<< "${URLS}"
fi

echo "✅ Phase 2 完成: 提取了 ${EXTRACT_COUNT} 个页面" >&2

# ─── Phase 3: MiniMax 结构化处理 ──────────────────────────────
echo "⏳ Phase 3: MiniMax M2.7 结构化处理..." >&2

# 合并搜索结果和提取内容
COMBINED_INPUT=$(python3 -c "
import json, sys, os

# 读搜索结果
search_items = []
try:
    with open('${INBOX_DIR}/search-raw.json') as f:
        search_items = json.loads(f.read())
except:
    pass

# 读提取内容
extracts = []
extract_file = '${INBOX_DIR}/extracted.jsonl'
if os.path.exists(extract_file):
    with open(extract_file) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    extracts.append(json.loads(line))
                except:
                    pass

output = {
    'search_findings': search_items,
    'extracted_pages': [
        {
            'url': e.get('url',''),
            'title': e.get('title',''),
            'text': (e.get('text','') or '')[:3000],
            'date': e.get('date'),
            'sitename': e.get('sitename'),
            'word_count': e.get('word_count',0)
        }
        for e in extracts
        if not e.get('error')
    ]
}
print(json.dumps(output, ensure_ascii=False))
")

# MiniMax 处理
MINIMAX_RESULT=$(curl -s "${OPENROUTER_BASE_URL}/chat/completions" \
  -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
  -H "Content-Type: application/json" \
  -H "HTTP-Referer: https://moboost.ai" \
  -d "$(python3 -c "
import json
combined = json.loads('''$(echo "${COMBINED_INPUT}" | python3 -c "import sys; print(sys.stdin.read().replace(\"'\",\"\\\\'\"))")''')
cat = '${CATEGORY}'
vert = '${VERTICAL}'
query = '''${QUERY}'''

prompt = f'''You are an intelligence analyst for Moboost AI, an iGaming MaaS platform.

TASK: Process the raw search findings and extracted page content below into structured intelligence entries for our knowledge base.

SEARCH QUERY: {query}
CATEGORY: {cat}
{f'VERTICAL: {vert}' if vert else ''}

RAW DATA:
{json.dumps(combined, ensure_ascii=False)[:12000]}

OUTPUT FORMAT: Return a JSON array. Each entry must have ALL these fields:
{{
  \"category\": \"{cat}\",
  \"vertical\": \"{vert}\" or null,
  \"region\": null or ISO region code,
  \"tags\": [\"tag1\", \"tag2\"],
  \"title\": \"Concise Chinese title (≤80 chars)\",
  \"summary\": \"Chinese summary with key facts, numbers, dates (≤500 chars)\",
  \"source_type\": \"agent\",
  \"source_url\": \"URL or null\",
  \"source_query\": \"{query}\",
  \"confidence\": 0.0-1.0,
  \"relevance\": 0.0-1.0,
  \"collected_by\": \"openclaw\"
}}

RULES:
1. Merge duplicate findings from search + extraction
2. Title and summary in Chinese
3. Keep specific numbers, dates, company names
4. Assign confidence based on source quality (official blog=0.9, news=0.8, forum=0.6)
5. Remove low-value generic entries
6. Return 3-8 high-quality entries
7. Return ONLY valid JSON array, no explanation'''

print(json.dumps({
    'model': 'minimax/MiniMax-M2.7',
    'max_tokens': 65536,
    'temperature': 0.1,
    'messages': [
        {'role': 'user', 'content': prompt}
    ]
}))
")")

# 提取 MiniMax 输出
ENTRIES=$(echo "${MINIMAX_RESULT}" | python3 -c "
import sys, json
r = json.load(sys.stdin)
c = r['choices'][0]['message']['content']
if not c:
    # 可能内容在 reasoning 里
    c = r['choices'][0]['message'].get('reasoning','[]')
# 去 markdown
if c.strip().startswith('\`\`\`'):
    lines = c.strip().split('\n')
    c = '\n'.join(lines[1:-1])
# 验证是否为有效 JSON 数组
data = json.loads(c)
assert isinstance(data, list), 'Not a list'
# 补齐缺失字段
all_keys = set()
for d in data:
    all_keys.update(d.keys())
for d in data:
    for k in all_keys:
        if k not in d:
            d[k] = None
print(json.dumps(data, ensure_ascii=False))
")

ENTRY_COUNT=$(echo "${ENTRIES}" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))")
echo "${ENTRIES}" > "${INBOX_DIR}/data.json"
echo "✅ Phase 3 完成: MiniMax 生成了 ${ENTRY_COUNT} 条结构化条目" >&2

# ─── Phase 4: 写入 Supabase ──────────────────────────────────
echo "⏳ Phase 4: 写入 Supabase..." >&2

DB_STATUS=$(curl -s -w "%{http_code}" -o /tmp/pipeline-db-response.txt \
  "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/industry_knowledge" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d "${ENTRIES}")

if [ "${DB_STATUS}" = "201" ]; then
  echo "✅ Phase 4 完成: ${ENTRY_COUNT} 条写入 industry_knowledge (HTTP 201)" >&2
else
  echo "⚠️  Phase 4 警告: HTTP ${DB_STATUS}" >&2
  cat /tmp/pipeline-db-response.txt >&2
fi

# ─── Phase 5: 生成 manifest + 日志 ───────────────────────────
python3 -c "
import json, datetime
manifest = {
    'version': '1.0',
    'id': '${RUN_ID}',
    'created_at': datetime.datetime.now().astimezone().isoformat(),
    'created_by': 'openclaw',
    'pipeline': 'perplexity → trafilatura → minimax → supabase',
    'topic': '''${QUERY}''',
    'category': '${CATEGORY}',
    'vertical': '${VERTICAL}' or None,
    'files': [
        {'path': 'search-raw.json', 'type': 'data', 'description': 'Perplexity 原始搜索结果'},
        {'path': 'extracted.jsonl', 'type': 'data', 'description': 'trafilatura 页面提取'},
        {'path': 'data.json', 'type': 'data', 'description': 'MiniMax 结构化条目 (已入库)'}
    ],
    'stats': {
        'search_urls': ${URL_COUNT},
        'pages_extracted': ${EXTRACT_COUNT},
        'entries_created': ${ENTRY_COUNT},
        'db_status': ${DB_STATUS}
    },
    'tags': ['pipeline', '${CATEGORY}']
}
with open('${INBOX_DIR}/manifest.json', 'w') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
print(json.dumps(manifest, ensure_ascii=False, indent=2))
"

# 写日志
echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"agent\":\"openclaw\",\"action\":\"pipeline\",\"run_id\":\"${RUN_ID}\",\"query\":\"${QUERY}\",\"category\":\"${CATEGORY}\",\"urls\":${URL_COUNT},\"extracted\":${EXTRACT_COUNT},\"entries\":${ENTRY_COUNT},\"db_status\":${DB_STATUS}}" >> "${LOG_FILE}"

echo "" >&2
echo "🎯 Pipeline 完成!" >&2
echo "   运行ID: ${RUN_ID}" >&2
echo "   搜索URL: ${URL_COUNT} | 页面提取: ${EXTRACT_COUNT} | 入库条目: ${ENTRY_COUNT}" >&2
echo "   投递目录: ${INBOX_DIR}" >&2
