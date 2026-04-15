#!/usr/bin/env python3
"""
pipeline.py — 一键情报采集流水线
=================================
用法: python3 pipeline.py "搜索查询" [--category trend] [--vertical "Sports Betting"]

流程: Perplexity搜索 → trafilatura提取 → MiniMax处理 → Supabase入库

示例:
  python3 pipeline.py "Optimove product updates 2026" --category competitor --vertical Casino
  python3 pipeline.py "iGaming AI marketing trends" --category trend
  python3 pipeline.py "sports betting regulation Europe 2026" --category regulation
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ─── 配置 ──────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent.parent.parent
BRIDGE_DIR = PROJECT_DIR / ".agent-bridge"
ENV_FILE = PROJECT_DIR / ".env.local"

def load_env():
    """从 .env.local 加载环境变量"""
    env = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
                os.environ.setdefault(k.strip(), v.strip())
    return env

def log(msg, icon=""):
    print(f"{icon} {msg}", file=sys.stderr)

# ─── HTTP 工具 ─────────────────────────────────────────────────

try:
    import httpx
    def post_json(url, headers, data, timeout=60):
        r = httpx.post(url, headers=headers, json=data, timeout=timeout)
        return r.status_code, r.json()
    def post_raw(url, headers, body, timeout=30):
        r = httpx.post(url, headers=headers, content=body,
                       headers_list=[("Content-Type", "application/json")] if isinstance(body, (str, bytes)) else None,
                       timeout=timeout)
        return r.status_code, r.text
except ImportError:
    import urllib.request
    def post_json(url, headers, data, timeout=60):
        body = json.dumps(data).encode()
        req = urllib.request.Request(url, data=body, headers={**headers, "Content-Type": "application/json"}, method="POST")
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, json.loads(resp.read())
    def post_raw(url, headers, body, timeout=30):
        if isinstance(body, str):
            body = body.encode()
        req = urllib.request.Request(url, data=body, headers={**headers, "Content-Type": "application/json"}, method="POST")
        resp = urllib.request.urlopen(req, timeout=timeout)
        return resp.status, resp.read().decode()

# ─── Phase 1: Perplexity 搜索 ─────────────────────────────────

def phase1_search(query, category, vertical, env):
    log("Phase 1: Perplexity 语义搜索...", "⏳")
    
    base_url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    api_key = env.get("OPENROUTER_API_KEY", "")
    
    vert_line = f"\nVertical: {vertical}" if vertical else ""
    
    payload = {
        "model": "perplexity/sonar-pro",
        "max_tokens": 4096,
        "temperature": 0.1,
        "messages": [
            {
                "role": "system",
                "content": "You are a senior iGaming industry analyst. Search the web and return findings as a JSON array. Each item must have: title (str), summary (str, ≤300 chars), source_url (str or null), tags (str array). Return ONLY valid JSON array, no markdown wrapping."
            },
            {
                "role": "user",
                "content": f"Find 5-10 recent (2025-2026) findings about: {query}\nCategory: {category}{vert_line}\nFocus on iGaming industry. Include specific companies, numbers, dates. Return ONLY JSON array."
            }
        ]
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://moboost.ai",
        "X-Title": "Moboost Intelligence Pipeline",
    }
    
    status, resp = post_json(f"{base_url}/chat/completions", headers, payload)
    content = resp["choices"][0]["message"]["content"]
    
    # 去 markdown 包裹
    if content.strip().startswith("```"):
        lines = content.strip().split("\n")
        content = "\n".join(lines[1:-1])
    
    try:
        items = json.loads(content)
    except json.JSONDecodeError:
        log(f"搜索结果解析失败，原始内容: {content[:200]}", "⚠️")
        items = []
    
    # 提取 URL
    urls = []
    seen = set()
    for item in items:
        url = item.get("source_url")
        if url and url.startswith("http") and url not in seen:
            seen.add(url)
            urls.append(url)
    
    log(f"Phase 1 完成: {len(items)} 条发现, {len(urls)} 个源 URL", "✅")
    return items, urls, content


# ─── Phase 2: trafilatura 深度提取 ─────────────────────────────

def phase2_extract(urls):
    log("Phase 2: 深度提取源页面...", "⏳")
    
    try:
        import trafilatura
        from trafilatura.settings import use_config
        HAS_TRAFILATURA = True
    except ImportError:
        log("trafilatura 未安装，跳过深度提取", "⚠️")
        HAS_TRAFILATURA = False
    
    extracts = []
    if not HAS_TRAFILATURA or not urls:
        log(f"Phase 2 完成: 提取了 0 个页面", "✅")
        return extracts
    
    config = use_config()
    config.set("DEFAULT", "EXTRACTION_TIMEOUT", "15")
    
    for url in urls[:8]:  # 最多提取 8 个
        log(f"  📄 {url}", "")
        try:
            if httpx:
                r = httpx.get(url, timeout=15, follow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"})
                html = r.text
            else:
                import urllib.request
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    html = resp.read().decode("utf-8", errors="replace")
            
            metadata = trafilatura.extract_metadata(html)
            text = trafilatura.extract(html, include_comments=False, include_tables=True,
                                       include_links=True, favor_recall=True, config=config)
            
            extracts.append({
                "url": url,
                "title": metadata.title if metadata else None,
                "text": (text or "")[:3000],
                "date": metadata.date if metadata else None,
                "sitename": metadata.sitename if metadata else None,
                "word_count": len(text.split()) if text else 0,
            })
        except Exception as e:
            extracts.append({"url": url, "error": str(e)})
    
    ok_count = sum(1 for e in extracts if "error" not in e)
    log(f"Phase 2 完成: 提取了 {ok_count}/{len(urls)} 个页面", "✅")
    return extracts


# ─── Phase 3: MiniMax 结构化处理 ──────────────────────────────

def phase3_process(query, category, vertical, search_items, extracts, env):
    log("Phase 3: MiniMax M2.7 结构化处理...", "⏳")
    
    base_url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    api_key = env.get("OPENROUTER_API_KEY", "")
    
    # 合并输入
    combined = {
        "search_findings": search_items[:10],
        "extracted_pages": [e for e in extracts if "error" not in e][:5],
    }
    combined_str = json.dumps(combined, ensure_ascii=False)[:15000]
    
    vert_str = f'"vertical": "{vertical}"' if vertical else '"vertical": null'
    
    prompt = f"""You are an intelligence analyst for Moboost AI, an iGaming MaaS platform.

TASK: Process the raw search findings and extracted page content into structured intelligence entries.

SEARCH QUERY: {query}
CATEGORY: {category}
{"VERTICAL: " + vertical if vertical else ""}

RAW DATA:
{combined_str}

OUTPUT: Return a JSON array. Each entry MUST have ALL these fields:
{{
  "category": "{category}",
  {vert_str},
  "region": null,
  "tags": ["tag1", "tag2"],
  "title": "Concise Chinese title (≤80 chars)",
  "summary": "Chinese summary with key facts, numbers, dates (≤500 chars)",
  "source_type": "agent",
  "source_url": "URL or null",
  "source_query": "{query}",
  "confidence": 0.0-1.0,
  "relevance": 0.0-1.0,
  "collected_by": "openclaw"
}}

RULES:
1. Merge duplicates from search + extraction
2. Title and summary MUST be in Chinese
3. Keep specific numbers, dates, company names
4. confidence: official blog=0.9, news=0.8, forum=0.6
5. Return 3-8 high-quality entries ONLY
6. Return ONLY valid JSON array"""
    
    payload = {
        "model": "minimax/MiniMax-M2.7",
        "max_tokens": 65536,
        "temperature": 0.1,
        "messages": [{"role": "user", "content": prompt}],
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "HTTP-Referer": "https://moboost.ai",
    }
    
    status, resp = post_json(f"{base_url}/chat/completions", headers, payload, timeout=120)
    
    content = resp["choices"][0]["message"].get("content") or ""
    
    # 如果 content 为空，检查是否在 reasoning 里
    if not content.strip():
        reasoning = resp["choices"][0]["message"].get("reasoning", "")
        if reasoning:
            log("content 为空，尝试从 reasoning 中提取...", "⚠️")
            content = reasoning
    
    # 去 markdown
    content = content.strip()
    if content.startswith("```"):
        lines = content.split("\n")
        # 去掉第一行 ```json 和最后一行 ```
        start = 1
        end = len(lines)
        for i in range(len(lines) - 1, 0, -1):
            if lines[i].strip().startswith("```"):
                end = i
                break
        content = "\n".join(lines[start:end])
    
    # 尝试多种方式解析 JSON
    entries = None
    
    # 方式1: 直接解析
    try:
        entries = json.loads(content)
    except json.JSONDecodeError:
        pass
    
    # 方式2: 找到第一个 [ 和最后一个 ] 之间的内容
    if entries is None:
        try:
            start = content.index("[")
            end = content.rindex("]") + 1
            entries = json.loads(content[start:end])
        except (ValueError, json.JSONDecodeError):
            pass
    
    # 方式3: 如果 JSON 被截断，尝试修复
    if entries is None:
        try:
            start = content.index("[")
            partial = content[start:]
            # 尝试逐步截断找到有效 JSON
            for trim in range(0, min(500, len(partial)), 1):
                candidate = partial[:len(partial) - trim]
                # 补齐可能缺失的括号
                for suffix in ["", "}", "}]", "\"}", "\"}"]:
                    try:
                        result = json.loads(candidate + suffix)
                        if isinstance(result, list) and len(result) > 0:
                            entries = result
                            log(f"JSON 截断修复成功 (去掉尾部 {trim} 字符, 补 '{suffix}')", "🔧")
                            break
                    except json.JSONDecodeError:
                        continue
                if entries:
                    break
        except ValueError:
            pass
    
    if entries is None or not isinstance(entries, list):
        log(f"MiniMax 输出解析失败: {content[:300]}", "❌")
        return []
    
    # 补齐字段
    all_keys = set()
    for e in entries:
        all_keys.update(e.keys())
    for e in entries:
        for k in all_keys:
            if k not in e:
                e[k] = None
    
    # 使用统计
    usage = resp.get("usage", {})
    cost = usage.get("cost", 0)
    log(f"Phase 3 完成: {len(entries)} 条结构化条目 (MiniMax cost: ${cost:.4f})", "✅")
    return entries


# ─── Phase 4: Supabase 入库 ───────────────────────────────────

def phase4_store(entries, env):
    log("Phase 4: 写入 Supabase...", "⏳")
    
    url = env.get("NEXT_PUBLIC_SUPABASE_URL", "")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY", "")
    
    if not url or not key:
        log("Supabase 未配置，跳过入库", "⚠️")
        return 0
    
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    body = json.dumps(entries, ensure_ascii=False).encode()
    
    try:
        req = urllib.request.Request(
            f"{url}/rest/v1/industry_knowledge",
            data=body, headers=headers, method="POST"
        )
        resp = urllib.request.urlopen(req, timeout=30)
        status = resp.status
    except Exception as e:
        # httpx fallback
        try:
            r = httpx.post(f"{url}/rest/v1/industry_knowledge",
                          headers=headers, content=body, timeout=30)
            status = r.status_code
        except:
            log(f"入库失败: {e}", "❌")
            return 0
    
    if status == 201:
        log(f"Phase 4 完成: {len(entries)} 条写入 industry_knowledge", "✅")
    else:
        log(f"Phase 4 警告: HTTP {status}", "⚠️")
    
    return status


# ─── Phase 5: manifest + 日志 ─────────────────────────────────

def phase5_finalize(run_id, query, category, vertical, inbox_dir,
                    search_items, urls, extracts, entries, db_status):
    
    tz = timezone(timedelta(hours=8))
    now = datetime.now(tz).isoformat()
    
    manifest = {
        "version": "1.0",
        "id": run_id,
        "created_at": now,
        "created_by": "openclaw",
        "pipeline": "perplexity → trafilatura → minimax-m2.7 → supabase",
        "topic": query,
        "category": category,
        "vertical": vertical or None,
        "files": [
            {"path": "search-raw.json", "description": "Perplexity 搜索结果"},
            {"path": "extracted.jsonl", "description": "trafilatura 页面提取"},
            {"path": "data.json", "description": "MiniMax 结构化条目 (已入库)"},
        ],
        "stats": {
            "search_findings": len(search_items),
            "source_urls": len(urls),
            "pages_extracted": sum(1 for e in extracts if "error" not in e),
            "entries_created": len(entries),
            "db_status": db_status,
        },
    }
    
    (inbox_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2))
    
    # 写日志
    log_dir = BRIDGE_DIR / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / f"{datetime.now(tz).strftime('%Y-%m-%d')}.jsonl"
    log_entry = {
        "ts": now,
        "agent": "openclaw",
        "action": "pipeline",
        "run_id": run_id,
        "query": query,
        "category": category,
        "stats": manifest["stats"],
    }
    with open(log_file, "a") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
    
    return manifest


# ─── Main ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="情报采集流水线")
    parser.add_argument("query", help="搜索查询")
    parser.add_argument("--category", "-c", default="trend",
                       help="知识类别: competitor/trend/regulation/best_practice/technology/market_data")
    parser.add_argument("--vertical", "-v", default="",
                       help="垂直领域: Sports Betting/Casino/Slots/Poker/Esports 等")
    parser.add_argument("--dry-run", action="store_true",
                       help="只搜索和处理，不写入数据库")
    args = parser.parse_args()
    
    env = load_env()
    
    tz = timezone(timedelta(hours=8))
    timestamp = datetime.now(tz).strftime("%Y%m%d-%H%M%S")
    slug = args.query.lower().replace(" ", "-")[:30]
    run_id = f"{timestamp}-{slug}"
    
    inbox_dir = BRIDGE_DIR / "inbox" / run_id
    inbox_dir.mkdir(parents=True, exist_ok=True)
    
    log(f"Pipeline started: {run_id}", "🔍")
    log(f"  Query: {args.query}", "")
    log(f"  Category: {args.category} | Vertical: {args.vertical or 'all'}", "")
    t0 = time.time()
    
    # Phase 1
    search_items, urls, raw_content = phase1_search(
        args.query, args.category, args.vertical, env)
    (inbox_dir / "search-raw.json").write_text(raw_content)
    
    # Phase 2
    extracts = phase2_extract(urls)
    with open(inbox_dir / "extracted.jsonl", "w") as f:
        for e in extracts:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    
    # Phase 3
    entries = phase3_process(
        args.query, args.category, args.vertical,
        search_items, extracts, env)
    (inbox_dir / "data.json").write_text(
        json.dumps(entries, ensure_ascii=False, indent=2))
    
    # Phase 4
    if args.dry_run:
        db_status = 0
        log("Dry run — 跳过数据库写入", "⏭️")
    else:
        db_status = phase4_store(entries, env) if entries else 0
    
    # Phase 5
    manifest = phase5_finalize(
        run_id, args.query, args.category, args.vertical,
        inbox_dir, search_items, urls, extracts, entries, db_status)
    
    elapsed = time.time() - t0
    
    log("", "")
    log(f"Pipeline 完成! ({elapsed:.1f}s)", "🎯")
    log(f"  搜索发现: {len(search_items)} | URL: {len(urls)} | 提取: {manifest['stats']['pages_extracted']} | 入库: {len(entries)}", "")
    log(f"  投递目录: {inbox_dir}", "")
    
    # 输出 manifest 到 stdout
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
