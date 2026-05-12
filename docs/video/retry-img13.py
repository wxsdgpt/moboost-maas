#!/usr/bin/env python3
"""Retry only IMG-13 (Rio beach) which failed due to 502 network error."""
import os
import base64
import requests
from pathlib import Path

API_KEY = os.environ.get("OPENROUTER_API_KEY",
    os.environ.get("OPENROUTER_API_KEY", "YOUR_KEY_HERE"))
BASE_URL = "https://openrouter.ai/api/v1"
HEADERS = {
    "Authorization": "Bearer " + API_KEY,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://moboost.ai",
    "X-Title": "Moboost AI MAAS",
}
OUT = Path(__file__).parent / "assets" / "images"

print("Retrying IMG-13 (Copacabana beach, Rio)...")
resp = requests.post(BASE_URL + "/chat/completions", headers=HEADERS, json={
    "model": "openai/gpt-5.4-image-2",
    "messages": [{"role": "user", "content":
        "Copacabana beach in Rio de Janeiro, Brazil. A young person relaxing on a "
        "colorful striped beach chair, holding a smartphone showing a Portuguese-language "
        "travel advertisement. Turquoise ocean waves in the background, white sand beach, "
        "palm trees. Bright sunny day, tropical paradise atmosphere. Travel lifestyle "
        "photography, 4K, vibrant tropical colors."
    }],
}, timeout=300)

print(f"Status: {resp.status_code}")
if resp.status_code != 200:
    print(f"Error: {resp.text[:300]}")
    exit(1)

data = resp.json()
cost = data.get("usage", {}).get("cost", "?")
print(f"Cost: ${cost}")

msg = data["choices"][0]["message"]
images = msg.get("images", [])
if images:
    item = images[0]
    url = ""
    if isinstance(item, dict) and "image_url" in item:
        url = item["image_url"].get("url", "")
    elif isinstance(item, dict) and "url" in item:
        url = item["url"]
    elif isinstance(item, str):
        url = item

    if url.startswith("data:"):
        b64 = url.split(",", 1)[1]
        out = OUT / "IMG-13.png"
        out.write_bytes(base64.b64decode(b64))
        print(f"Saved: {out} ({out.stat().st_size // 1024} KB)")
    else:
        print(f"Unexpected URL format: {url[:100]}")
else:
    print("No images in response!")
    print(f"Message keys: {list(msg.keys())}")
