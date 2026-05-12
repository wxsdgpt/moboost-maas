import os
#!/usr/bin/env python3
"""Quick test: generate 1 image with Nano Banana Pro, dump full response structure."""
import json
import requests

API_KEY = os.environ.get("OPENROUTER_API_KEY", "YOUR_KEY_HERE")
BASE_URL = "https://openrouter.ai/api/v1"
HEADERS = {
    "Authorization": "Bearer " + API_KEY,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://moboost.ai",
    "X-Title": "Moboost AI MAAS",
}

print("Testing Nano Banana Pro (gemini-3-pro-image-preview)...")
resp = requests.post(
    BASE_URL + "/chat/completions",
    headers=HEADERS,
    json={
        "model": "google/gemini-3-pro-image-preview",
        "modalities": ["image", "text"],
        "messages": [{"role": "user", "content": "Generate an image: A cute Siamese cat sitting on a red cushion, studio lighting, 4K photo"}],
    },
    timeout=120,
)

print(f"Status: {resp.status_code}")
print(f"Content-Type: {resp.headers.get('content-type')}")
print(f"Response length: {len(resp.text)}")

try:
    data = resp.json()
    # Print structure without huge base64 blobs
    def summarize(obj, depth=0):
        indent = "  " * depth
        if isinstance(obj, dict):
            print(indent + "{")
            for k, v in obj.items():
                if isinstance(v, str) and len(v) > 200:
                    print(indent + f"  {k}: <string len={len(v)}, first 100 chars: {v[:100]}...>")
                elif isinstance(v, (dict, list)):
                    print(indent + f"  {k}:")
                    summarize(v, depth + 2)
                else:
                    print(indent + f"  {k}: {v}")
            print(indent + "}")
        elif isinstance(obj, list):
            print(indent + f"[list len={len(obj)}]")
            for i, item in enumerate(obj[:3]):  # First 3 items
                print(indent + f"  [{i}]:")
                summarize(item, depth + 2)
            if len(obj) > 3:
                print(indent + f"  ... ({len(obj) - 3} more)")
        else:
            print(indent + str(obj))

    summarize(data)
except Exception as e:
    print(f"JSON parse error: {e}")
    print(f"Raw response first 500 chars: {resp.text[:500]}")
