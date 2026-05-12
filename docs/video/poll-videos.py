#!/usr/bin/env python3
"""Poll the 3 video jobs already submitted to OpenRouter."""
import os
import json
import time
import base64
import requests
from pathlib import Path

API_KEY = os.environ.get("OPENROUTER_API_KEY",
    os.environ.get("OPENROUTER_API_KEY", "YOUR_KEY_HERE"))
AUTH = {"Authorization": "Bearer " + API_KEY}
OUT = Path(__file__).parent / "assets" / "videos"
OUT.mkdir(parents=True, exist_ok=True)

JOBS = [
    ("VID-01", "5PcKvDaPuLWDiSSJlUfk"),
    ("VID-02", "oenedxq3Kjh7CRxR8YFd"),
    ("VID-03", "UHIuQxCPdJKOpMj17Dnq"),
]

for vid_id, job_id in JOBS:
    print(f"\n{'='*50}")
    print(f"{vid_id} — job {job_id}")
    print(f"{'='*50}")

    # Step 1: Poll status
    url = f"https://openrouter.ai/api/v1/videos/{job_id}"
    r = requests.get(url, headers=AUTH, timeout=30)
    print(f"  Poll status: HTTP {r.status_code}")

    raw = r.text.strip()
    idx = raw.find("{")
    if idx > 0:
        raw = raw[idx:]
    try:
        data = json.loads(raw)
    except Exception:
        print(f"  Response: {r.text[:300]}")
        continue

    print(f"  Response: {json.dumps(data, indent=2)[:500]}")

    status = data.get("status", "unknown")
    print(f"  Status: {status}")

    # If completed, try to download
    if status in ("completed", "succeeded", "complete"):
        # Check if URL already in poll response
        video_url = data.get("url") or data.get("video_url")
        generations = data.get("generations") or data.get("output", [])
        if isinstance(generations, list):
            for g in generations:
                if isinstance(g, dict):
                    video_url = video_url or g.get("url") or g.get("video_url")

        if video_url:
            print(f"  Video URL found in poll: {video_url[:100]}...")
            if video_url.startswith("data:"):
                payload = video_url.split(",", 1)[1]
                out = OUT / f"{vid_id}.mp4"
                out.write_bytes(base64.b64decode(payload))
                print(f"  Saved: {out} ({out.stat().st_size // 1024} KB)")
            elif video_url.startswith("http"):
                dr = requests.get(video_url, timeout=600)
                if dr.ok:
                    out = OUT / f"{vid_id}.mp4"
                    out.write_bytes(dr.content)
                    print(f"  Saved: {out} ({out.stat().st_size // 1024} KB)")
            continue

        # Try /content endpoint
        print(f"  Trying /content download...")
        dl = requests.get(f"{url}/content?index=0", headers=AUTH, timeout=600)
        print(f"  Download: HTTP {dl.status_code}, Content-Type: {dl.headers.get('content-type','?')}")
        ct = dl.headers.get("content-type", "")
        if "video" in ct or "octet-stream" in ct:
            out = OUT / f"{vid_id}.mp4"
            out.write_bytes(dl.content)
            print(f"  Saved: {out} ({out.stat().st_size // 1024} KB)")
        else:
            dl_raw = dl.text.strip()
            idx2 = dl_raw.find("{")
            if idx2 >= 0:
                try:
                    dl_data = json.loads(dl_raw[idx2:])
                    print(f"  Download response: {json.dumps(dl_data, indent=2)[:300]}")
                except Exception:
                    print(f"  Download body: {dl.text[:300]}")
            else:
                print(f"  Download body: {dl.text[:300]}")
    elif status in ("failed", "error"):
        print(f"  Error: {data.get('error', 'unknown')}")
    else:
        print(f"  Still processing... (pending/processing)")

print("\nDone.")
