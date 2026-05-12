#!/usr/bin/env python3
"""
Generate 3 AI videos for Moboost MAAS promo video using Veo 3.1 via OpenRouter.

Based on existing project code:
  - src/app/api/generate-video/route.ts  (async: submit → poll → download)
  - src/app/api/brief/regenerate-creative/route.ts  (sync: chat/completions)
  - services/ad-localization/backend/app/ai/openrouter_video.py  (_extract_video)

Strategy:
  1. Try async API first (POST /api/v1/videos → poll → download)
  2. If async API fails (404/unsupported), fallback to sync chat/completions
  3. Video extraction follows backend _extract_video pattern: check
     videos[], attachments[], content[] for data: URIs or HTTP URLs

Usage:
  cd /Users/wangxudemac/moboost\ AI/moboost-maas/docs/video
  python3 generate-videos.py
"""
import os
import sys
import json
import base64
import time
import re
import requests
from pathlib import Path
from typing import Optional, Tuple

# --- Config (matches .env.local) ---
API_KEY = os.environ.get("OPENROUTER_API_KEY",
    os.environ.get("OPENROUTER_API_KEY", "YOUR_KEY_HERE"))
BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
VIDEO_MODEL = os.environ.get("VIDEO_MODEL", "google/veo-3.1")

# Matches src/app/api/generate-video/route.ts headers
HEADERS = {
    "Authorization": "Bearer " + API_KEY,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://moboost.ai",
    "X-Title": "Moboost AI MAAS",
}
AUTH_HEADERS = {"Authorization": "Bearer " + API_KEY}

OUT = Path(__file__).parent / "assets" / "videos"
OUT.mkdir(parents=True, exist_ok=True)

# --- Video Prompts (from PROMO-VIDEO-SCRIPT-v2.md Section 5.2) ---
VIDEOS = [
    {
        "id": "VID-01",
        "name": "Cat walking to food bowl",
        "prompt": (
            "A beautiful Siamese cat with blue eyes elegantly walks across a modern kitchen "
            "countertop, then gracefully jumps down to the floor and walks toward a premium ceramic "
            "food bowl. Close-up slow-motion shot of premium fish-flavored cat treats being poured "
            "into the bowl. The cat begins eating happily. Warm lighting, shallow depth of field, "
            "commercial pet food advertisement style. 5 seconds, seamless loop, 4K, cinematic."
        ),
    },
    {
        "id": "VID-02",
        "name": "Running rhythm montage",
        "prompt": (
            "Dynamic running footage montage: close-up of running shoes hitting asphalt in slow "
            "motion, rhythmic breathing visible in cool morning air, sunrise city skyline silhouette "
            "in background. Camera follows the runner from low angle. Sweat droplets catching golden "
            "light. Urban morning running vibe, energetic but smooth. Sport brand commercial style. "
            "5 seconds, seamless loop, 4K, cinematic."
        ),
    },
    {
        "id": "VID-03",
        "name": "Sushi master crafting",
        "prompt": (
            "Overhead close-up of a Japanese sushi master's hands expertly crafting nigiri sushi. "
            "He carefully slices fresh salmon with a sharp knife, then places the fish on a small "
            "mound of seasoned rice. The finished piece is placed on an elegant wooden board with "
            "other beautifully arranged sushi. Soft natural lighting from a window, steam rising "
            "gently. Traditional Japanese restaurant ambiance. Food documentary style, 5 seconds, "
            "seamless loop, 4K, cinematic."
        ),
    },
]


# ============================================================
# Extraction: follows backend openrouter_video.py _extract_video
# ============================================================

def extract_media_url(obj):
    # type: (object) -> Optional[str]
    """Recursively walk response looking for video URL.
    Matches regenerate-creative/route.ts extractMediaUrl() logic."""
    if isinstance(obj, str):
        if obj.startswith("data:video/"):
            return obj
        if re.search(r'^https?://.*\.(mp4|webm|mov)(\?|$)', obj, re.I):
            return obj
        return None
    if isinstance(obj, list):
        for item in obj:
            found = extract_media_url(item)
            if found:
                return found
        return None
    if isinstance(obj, dict):
        for key in obj:
            found = extract_media_url(obj[key])
            if found:
                return found
    return None


def extract_video_from_response(vid_id, data):
    # type: (str, dict) -> Optional[str]
    """Extract and save video from API response.

    Checks multiple locations following backend pattern:
    - message.videos[], message.attachments[], message.content[]
    - Deep recursive scan for data:video/ or .mp4 URLs
    Returns saved filepath or None.
    """
    # Try choices[0].message first (chat/completions response)
    choices = data.get("choices", [])
    if choices:
        msg = choices[0].get("message", {})

        # Check known bucket fields (openrouter_video.py pattern)
        for bucket_key in ["videos", "attachments", "images", "media"]:
            items = msg.get(bucket_key, [])
            if not items:
                continue
            for item in (items if isinstance(items, list) else [items]):
                url = _extract_url_from_item(item)
                if url:
                    return _save_video(vid_id, url, bucket_key)

        # Check content array
        content = msg.get("content", "")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    url = None
                    if part.get("type") == "video_url":
                        url_obj = part.get("video_url", {})
                        url = url_obj.get("url", "") if isinstance(url_obj, dict) else url_obj
                    elif part.get("type") == "image_url":
                        url_obj = part.get("image_url", {})
                        url = url_obj.get("url", "") if isinstance(url_obj, dict) else url_obj
                    if url:
                        return _save_video(vid_id, url, "content[]")

        # String content — might contain a URL
        if isinstance(content, str) and content.strip():
            url = extract_media_url(content)
            if url:
                return _save_video(vid_id, url, "content-str")

    # Fallback: deep recursive scan of entire response
    url = extract_media_url(data)
    if url:
        return _save_video(vid_id, url, "deep-scan")

    # Debug info
    if choices:
        msg = choices[0].get("message", {})
        print(f"  Could not extract video!")
        print(f"  Message keys: {list(msg.keys())}")
        ct = msg.get("content", "")
        print(f"  Content type: {type(ct).__name__}", end="")
        if isinstance(ct, str):
            print(f", len={len(ct)}, first 200: {ct[:200]}")
        elif isinstance(ct, list):
            print(f", len={len(ct)}")
            for i, p in enumerate(ct[:3]):
                if isinstance(p, dict):
                    print(f"    [{i}] type={p.get('type','?')}, keys={list(p.keys())}")
        else:
            print()
        for k in ["videos", "attachments", "media", "images"]:
            v = msg.get(k)
            if v:
                print(f"  {k}: type={type(v).__name__}, len={len(v) if isinstance(v, list) else '?'}")
    else:
        print(f"  No choices! Response keys: {list(data.keys())}")

    # Save raw for debugging
    raw_out = OUT / f"{vid_id}_raw_response.json"
    raw_str = json.dumps(data, indent=2, default=str)
    if len(raw_str) > 100000:
        raw_str = raw_str[:100000] + "\n... (truncated)"
    raw_out.write_text(raw_str)
    print(f"  Raw response saved: {raw_out.name}")

    return None


def _extract_url_from_item(item):
    # type: (object) -> Optional[str]
    """Extract URL from a single item in videos/attachments/etc arrays.
    Follows openrouter_video.py _extract_video bucket scan logic."""
    if isinstance(item, str):
        return item if (item.startswith("data:") or item.startswith("http")) else None

    if isinstance(item, dict):
        # Try video_url.url
        for url_key in ["video_url", "image_url", "url_obj"]:
            url_obj = item.get(url_key)
            if url_obj:
                url = url_obj.get("url") if isinstance(url_obj, dict) else url_obj
                if isinstance(url, str) and (url.startswith("data:") or url.startswith("http")):
                    return url

        # Try direct url field
        url = item.get("url", "")
        if isinstance(url, str) and (url.startswith("data:") or url.startswith("http")):
            return url

        # Check type=video_url pattern
        if item.get("type") == "video_url":
            vurl = item.get("video_url", {})
            url = vurl.get("url") if isinstance(vurl, dict) else vurl
            if isinstance(url, str):
                return url

    return None


def _save_video(vid_id, url, source):
    # type: (str, str, str) -> Optional[str]
    """Save video from URL (data: or http) to disk."""
    if url.startswith("data:"):
        # data:video/mp4;base64,XXXX
        head, _, payload = url.partition(",")
        if not payload:
            print(f"  Empty base64 payload in data URI from {source}")
            return None
        mime = head.replace("data:", "").split(";")[0]
        ext = "mp4"
        if "webm" in mime:
            ext = "webm"
        elif "mov" in mime:
            ext = "mov"
        out = OUT / f"{vid_id}.{ext}"
        out.write_bytes(base64.b64decode(payload))
        print(f"  Saved from {source}: {out.name} ({out.stat().st_size // 1024} KB)")
        return str(out)

    elif url.startswith("http"):
        print(f"  Downloading from {source}: {url[:100]}...")
        r = requests.get(url, timeout=600)
        if r.ok:
            ct = r.headers.get("content-type", "")
            ext = "mp4"
            if "webm" in ct:
                ext = "webm"
            elif "mov" in ct:
                ext = "mov"
            out = OUT / f"{vid_id}.{ext}"
            out.write_bytes(r.content)
            print(f"  Saved from {source} URL: {out.name} ({out.stat().st_size // 1024} KB)")
            return str(out)
        else:
            print(f"  Download failed: HTTP {r.status_code}")
            return None

    return None


# ============================================================
# Path A: Async video API (generate-video/route.ts pattern)
#   POST /api/v1/videos → poll → download binary
# ============================================================

def generate_async(vid_id, prompt):
    # type: (str, str) -> Optional[str]
    """Try async video generation: submit → poll → download.
    Returns saved filepath or None."""

    # Step 1: Submit
    # Matches generate-video/route.ts action='submit'
    want_audio = os.environ.get("VIDEO_GENERATE_AUDIO", "true") != "false"
    body = {
        "model": VIDEO_MODEL,
        "prompt": prompt,
        "generate_audio": want_audio,
    }
    print(f"  [async] Submitting to /api/v1/videos...")
    try:
        resp = requests.post(
            "https://openrouter.ai/api/v1/videos",
            headers=HEADERS,
            json=body,
            timeout=300,
        )
    except Exception as e:
        print(f"  [async] Submit request error: {e}")
        return None

    if resp.status_code == 404:
        print(f"  [async] /api/v1/videos returned 404 — endpoint may not exist")
        return None  # Fall through to sync path

    # 200 = sync completion, 202 = async accepted (job submitted)
    if resp.status_code not in (200, 201, 202):
        text = resp.text[:300]
        # Check for HTML response (maintenance page)
        if text.strip().startswith("<!") or text.strip().startswith("<html"):
            print(f"  [async] Submit got HTML response (HTTP {resp.status_code}) — API unavailable")
            return None
        print(f"  [async] Submit failed: HTTP {resp.status_code} — {text}")
        return None

    # Parse JSON — response may have leading whitespace/newlines before JSON
    raw_text = resp.text.strip()
    # Some responses have HTML-like whitespace before JSON body
    json_start = raw_text.find("{")
    if json_start > 0:
        raw_text = raw_text[json_start:]

    try:
        submit_data = json.loads(raw_text)
    except Exception:
        print(f"  [async] Submit response not JSON: {resp.text[:200]}")
        return None

    print(f"  [async] Submit OK (HTTP {resp.status_code}): {json.dumps(submit_data, indent=2)}")

    job_id = submit_data.get("id") or submit_data.get("job_id")
    polling_url = submit_data.get("polling_url")
    status = submit_data.get("status", "")

    if not job_id:
        print(f"  [async] No job_id in submit response: {list(submit_data.keys())}")
        # Maybe the response already contains the video (inline mode)
        path = extract_video_from_response(vid_id, submit_data)
        if path:
            return path
        return None

    print(f"  [async] Job submitted: {job_id} (status={status})")
    if polling_url:
        print(f"  [async] Polling URL: {polling_url}")

    # Use polling_url if provided, otherwise construct from job_id
    poll_base = polling_url or f"https://openrouter.ai/api/v1/videos/{job_id}"

    # Step 2: Poll until completed
    # Matches generate-video/route.ts action='poll'
    max_attempts = 120  # ~10 minutes at 5s intervals
    for attempt in range(max_attempts):
        time.sleep(5)
        try:
            poll_resp = requests.get(
                poll_base,
                headers=AUTH_HEADERS,
                timeout=30,
            )
        except Exception as e:
            print(f"  [async] Poll error: {e}")
            continue

        if not poll_resp.ok:
            print(f"  [async] Poll HTTP {poll_resp.status_code}")
            continue

        try:
            poll_text = poll_resp.text.strip()
            json_idx = poll_text.find("{")
            if json_idx > 0:
                poll_text = poll_text[json_idx:]
            poll_data = json.loads(poll_text)
        except Exception:
            print(f"  [async] Poll response not JSON: {poll_resp.text[:100]}")
            continue

        status = poll_data.get("status", "unknown")
        progress = poll_data.get("progress", "")
        if attempt % 6 == 0:  # Print every 30s
            print(f"  [async] Poll #{attempt+1}: status={status} progress={progress}")

        if status in ("completed", "succeeded", "complete"):
            print(f"  [async] Job completed after {(attempt+1)*5}s!")
            # Check if polling response already contains video URL
            video_url = poll_data.get("url") or poll_data.get("video_url")
            if video_url:
                path = _save_video(vid_id, video_url, "poll-response")
                if path:
                    return path
            # Also check for output/generations array
            generations = poll_data.get("generations") or poll_data.get("output", [])
            if isinstance(generations, list):
                for gen in generations:
                    if isinstance(gen, dict):
                        gurl = gen.get("url") or gen.get("video_url")
                        if gurl:
                            path = _save_video(vid_id, gurl, "poll-generations")
                            if path:
                                return path
            break
        elif status in ("failed", "error", "cancelled"):
            err = poll_data.get("error", "unknown error")
            print(f"  [async] Job failed: {err}")
            return None
    else:
        print(f"  [async] Timed out after {max_attempts * 5}s")
        return None

    # Step 3: Download
    # Matches generate-video/route.ts action='download'
    print(f"  [async] Downloading video content...")
    try:
        dl_resp = requests.get(
            f"https://openrouter.ai/api/v1/videos/{job_id}/content?index=0",
            headers=AUTH_HEADERS,
            timeout=600,
        )
    except Exception as e:
        print(f"  [async] Download error: {e}")
        return None

    if not dl_resp.ok:
        print(f"  [async] Download failed: HTTP {dl_resp.status_code} — {dl_resp.text[:200]}")
        return None

    ct = dl_resp.headers.get("content-type", "")

    # Binary video response
    if "video" in ct or "octet-stream" in ct:
        ext = "mp4"
        if "webm" in ct:
            ext = "webm"
        out = OUT / f"{vid_id}.{ext}"
        out.write_bytes(dl_resp.content)
        print(f"  [async] Saved binary: {out.name} ({out.stat().st_size // 1024} KB)")
        return str(out)

    # JSON response with URL
    try:
        dl_data = dl_resp.json()
        url = dl_data.get("url") or dl_data.get("video_url")
        if url:
            return _save_video(vid_id, url, "async-download-json")

        # Try extracting from full response
        return extract_video_from_response(vid_id, dl_data)
    except Exception:
        # Maybe it's raw binary without proper content-type
        if len(dl_resp.content) > 1000:
            out = OUT / f"{vid_id}.mp4"
            out.write_bytes(dl_resp.content)
            print(f"  [async] Saved raw bytes: {out.name} ({out.stat().st_size // 1024} KB)")
            return str(out)

    return None


# ============================================================
# Path B: Sync chat/completions (regenerate-creative fallback)
# ============================================================

def generate_sync(vid_id, prompt):
    # type: (str, str) -> Optional[str]
    """Fallback: generate via chat/completions endpoint.
    Matches regenerate-creative/route.ts generateVideo() pattern."""

    print(f"  [sync] Trying /chat/completions...")
    body = {
        "model": VIDEO_MODEL,
        "messages": [{"role": "user", "content": prompt}],
    }

    try:
        resp = requests.post(
            BASE_URL + "/chat/completions",
            headers=HEADERS,
            json=body,
            timeout=600,
        )
    except requests.exceptions.Timeout:
        print(f"  [sync] Timeout after 600s")
        return None
    except Exception as e:
        print(f"  [sync] Request error: {e}")
        return None

    print(f"  [sync] Status: {resp.status_code}")

    if resp.status_code != 200:
        text = resp.text[:300]
        if text.strip().startswith("<!") or text.strip().startswith("<html"):
            print(f"  [sync] Got HTML response — API unavailable")
        else:
            print(f"  [sync] Error: {text}")
        return None

    try:
        data = resp.json()
    except Exception as e:
        print(f"  [sync] JSON parse error: {e}")
        # Try saving as raw binary if response is large
        if len(resp.content) > 10000:
            out = OUT / f"{vid_id}.mp4"
            out.write_bytes(resp.content)
            print(f"  [sync] Saved raw content: {out.name} ({out.stat().st_size // 1024} KB)")
            return str(out)
        return None

    cost = data.get("usage", {}).get("cost", "?")
    print(f"  [sync] Cost: ${cost}")

    return extract_video_from_response(vid_id, data)


# ============================================================
# Main
# ============================================================

def main():
    print("=" * 60)
    print("Moboost MAAS — Video Generation Script")
    print("=" * 60)
    print(f"Model: {VIDEO_MODEL}")
    print(f"Output: {OUT}")
    print(f"Videos: {len(VIDEOS)}")
    print(f"Strategy: async (/api/v1/videos) → sync (/chat/completions)")
    print("=" * 60)

    results = []

    for i, vid in enumerate(VIDEOS):
        vid_id = vid["id"]
        vid_name = vid["name"]
        prompt = vid["prompt"]

        print(f"\n{'='*60}")
        print(f"[{i+1}/{len(VIDEOS)}] {vid_id}: {vid_name}")
        print(f"{'='*60}")
        print(f"  Prompt: {prompt[:80]}...")

        start = time.time()

        # Try async first (project's primary video API)
        path = generate_async(vid_id, prompt)

        # Fallback to sync if async failed
        if not path:
            print(f"  Async failed, trying sync fallback...")
            path = generate_sync(vid_id, prompt)

        elapsed = time.time() - start
        print(f"  Total time: {elapsed:.1f}s")

        if path:
            results.append({"id": vid_id, "status": "ok", "path": path, "time": elapsed})
        else:
            results.append({"id": vid_id, "status": "failed", "time": elapsed})

    # Summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print("=" * 60)
    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"Success: {ok}/{len(VIDEOS)}")
    for r in results:
        icon = "OK" if r["status"] == "ok" else "FAIL"
        print(f"  [{icon}] {r['id']} ({r['time']:.0f}s)")
        if r.get("path"):
            print(f"       -> {r['path']}")


if __name__ == "__main__":
    main()
