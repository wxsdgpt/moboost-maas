import os
#!/usr/bin/env python3
"""Test: generate 1 image with each model, verify extraction works."""
import json
import base64
import requests
from pathlib import Path

API_KEY = os.environ.get("OPENROUTER_API_KEY", "YOUR_KEY_HERE")
BASE_URL = "https://openrouter.ai/api/v1"
HEADERS = {
    "Authorization": "Bearer " + API_KEY,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://moboost.ai",
    "X-Title": "Moboost AI MAAS",
}
OUT = Path(__file__).parent / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)


def extract_image(img_id, data):
    """Extract and save image from OpenRouter response."""
    choices = data.get("choices", [])
    if not choices:
        print("  No choices!")
        return False
    msg = choices[0].get("message", {})

    # Try images array first
    images = msg.get("images", [])
    if images:
        item = images[0]
        url = ""
        if isinstance(item, dict):
            if "image_url" in item:
                url = item["image_url"].get("url", "")
            elif "url" in item:
                url = item["url"]
        elif isinstance(item, str):
            url = item

        if url.startswith("data:"):
            b64 = url.split(",", 1)[1]
            out = OUT / (img_id + ".png")
            out.write_bytes(base64.b64decode(b64))
            print(f"  Saved from images[]: {out.name} ({out.stat().st_size // 1024} KB)")
            return True

    # Try content array
    content = msg.get("content", "")
    if isinstance(content, list):
        for part in content:
            if isinstance(part, dict):
                if part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url", "")
                    if url.startswith("data:"):
                        b64 = url.split(",", 1)[1]
                        out = OUT / (img_id + ".png")
                        out.write_bytes(base64.b64decode(b64))
                        print(f"  Saved from content[]: {out.name} ({out.stat().st_size // 1024} KB)")
                        return True
                    elif url.startswith("http"):
                        r = requests.get(url, timeout=60)
                        if r.ok:
                            out = OUT / (img_id + ".png")
                            out.write_bytes(r.content)
                            print(f"  Saved from URL: {out.name} ({out.stat().st_size // 1024} KB)")
                            return True

    print(f"  Failed! message keys: {list(msg.keys())}")
    if images:
        print(f"  images[0] type: {type(images[0])}, keys: {list(images[0].keys()) if isinstance(images[0], dict) else 'N/A'}")
    return False


# Test 1: Nano Banana Pro
print("\n=== Test 1: Nano Banana Pro ===")
r1 = requests.post(BASE_URL + "/chat/completions", headers=HEADERS, json={
    "model": "google/gemini-3-pro-image-preview",
    "modalities": ["image", "text"],
    "messages": [{"role": "user", "content": "Generate an image: A simple red apple on a white background, product photo"}],
}, timeout=120)
print(f"Status: {r1.status_code}, Size: {len(r1.text)}")
if r1.ok:
    d1 = r1.json()
    cost1 = d1.get("usage", {}).get("cost", "?")
    print(f"  Cost: ${cost1}")
    extract_image("TEST-nano", d1)

# Test 2: GPT Image 2
print("\n=== Test 2: GPT Image 2 ===")
r2 = requests.post(BASE_URL + "/chat/completions", headers=HEADERS, json={
    "model": "openai/gpt-5.4-image-2",
    "messages": [{"role": "user", "content": "Generate an image: A simple blue ocean wave, minimalist, 4K"}],
}, timeout=300)
print(f"Status: {r2.status_code}, Size: {len(r2.text)}")
if r2.ok:
    d2 = r2.json()
    cost2 = d2.get("usage", {}).get("cost", "?")
    print(f"  Cost: ${cost2}")
    extract_image("TEST-gpt", d2)
    # Also dump structure
    msg2 = d2["choices"][0]["message"]
    print(f"  GPT message keys: {list(msg2.keys())}")
    imgs2 = msg2.get("images", [])
    content2 = msg2.get("content", "")
    print(f"  images count: {len(imgs2)}, content type: {type(content2).__name__}")
    if imgs2 and isinstance(imgs2[0], dict):
        print(f"  images[0] keys: {list(imgs2[0].keys())}")
    if isinstance(content2, list) and content2:
        print(f"  content[0] keys: {list(content2[0].keys()) if isinstance(content2[0], dict) else 'N/A'}")

print("\nDone!")
