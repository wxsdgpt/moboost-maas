#!/usr/bin/env python3
"""
extract.py — 高速文章正文提取
=============================
用法: python3 extract.py <url> [--json] [--with-metadata]

使用 trafilatura 提取网页正文，去除导航/广告/侧边栏。
比 Playwright 快 10x，适合批量处理。

适合：新闻文章、博客、报告、文档
不适合：SPA、JS 渲染页面（用 crawl.js）
"""

import sys
import json
import argparse

try:
    import trafilatura
    from trafilatura.settings import use_config
except ImportError:
    print(json.dumps({"error": "trafilatura not installed. Run: pip3 install --user trafilatura"}))
    sys.exit(1)

try:
    import httpx
except ImportError:
    import urllib.request
    httpx = None


def fetch_url(url: str, timeout: int = 15) -> str:
    """Fetch URL content with proper headers."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    if httpx:
        r = httpx.get(url, headers=headers, timeout=timeout, follow_redirects=True)
        r.raise_for_status()
        return r.text
    else:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read().decode("utf-8", errors="replace")


def extract(url: str, with_metadata: bool = False) -> dict:
    """Extract article content from URL."""
    config = use_config()
    config.set("DEFAULT", "EXTRACTION_TIMEOUT", "30")
    
    html = fetch_url(url)
    
    result = {
        "url": url,
        "text": None,
        "title": None,
        "author": None,
        "date": None,
        "description": None,
        "sitename": None,
        "word_count": 0,
    }

    if with_metadata:
        metadata = trafilatura.extract_metadata(html)
        if metadata:
            result["title"] = metadata.title
            result["author"] = metadata.author
            result["date"] = metadata.date
            result["description"] = metadata.description
            result["sitename"] = metadata.sitename

    text = trafilatura.extract(
        html,
        include_comments=False,
        include_tables=True,
        include_links=True,
        include_images=False,
        favor_recall=True,
        config=config,
    )

    if text:
        result["text"] = text
        result["word_count"] = len(text.split())
    
    return result


def batch_extract(urls: list, with_metadata: bool = False) -> list:
    """Extract from multiple URLs."""
    results = []
    for url in urls:
        try:
            r = extract(url, with_metadata)
            results.append(r)
        except Exception as e:
            results.append({"url": url, "error": str(e)})
    return results


def main():
    parser = argparse.ArgumentParser(description="Extract article content from URLs")
    parser.add_argument("urls", nargs="+", help="URLs to extract")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--with-metadata", action="store_true", help="Include metadata")
    args = parser.parse_args()

    if len(args.urls) == 1:
        result = extract(args.urls[0], args.with_metadata)
    else:
        result = batch_extract(args.urls, args.with_metadata)

    if args.json or len(args.urls) > 1:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if result.get("title"):
            print(f"# {result['title']}\n")
        if result.get("text"):
            print(result["text"])
        else:
            print("(no content extracted)")


if __name__ == "__main__":
    main()
