#!/usr/bin/env python3
"""
Moboost Promo Video — Batch Image Generation (Round 1)
Uses OpenRouter API with Nano Banana Pro (character scenes) and GPT Image 2 (environments/ads).
"""

import os
import sys
import json
import time
import base64
import requests
from pathlib import Path
from typing import Optional

# ── Config ──────────────────────────────────────────────────────────────
API_KEY = os.environ.get("OPENROUTER_API_KEY", "YOUR_KEY_HERE")
BASE_URL = "https://openrouter.ai/api/v1"
OUTPUT_DIR = Path(__file__).parent / "assets" / "images"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
    "HTTP-Referer": "https://moboost.ai",
    "X-Title": "Moboost AI MAAS",
}

# Models
NANO_BANANA_PRO = "google/gemini-3-pro-image-preview"   # Best for character consistency
GPT_IMAGE_2     = "openai/gpt-5.4-image-2"              # Best overall quality

# ── Image Specifications ────────────────────────────────────────────────
# Each entry: (id, model, prompt, aspect_note)
# Character scenes use Nano Banana Pro for face consistency
# Environment/ad scenes use GPT Image 2 for quality

IMAGES = [
    # ── ACT 1: Pain Point + Onboarding ──
    ("IMG-01", GPT_IMAGE_2,
     "Overhead photo of a cluttered marketing desk at night. Multiple laptop screens showing Excel spreadsheets, social media dashboards, and translation tools with red error messages. Crumpled papers, empty coffee cups, sticky notes everywhere. A person's hands rubbing their temples in frustration. Dark moody lighting, desaturated cold blue tones, cinematic 4K, photorealistic.",
     "16:9"),

    # ── ACT 2: Creative Assets (Product Ads) ──
    ("IMG-02", GPT_IMAGE_2,
     "Premium commercial advertisement photo: A beautiful Siamese cat with striking blue eyes sitting elegantly next to a luxury bowl of fresh fish treats. Warm golden lighting, soft bokeh background. Brand name 'Paws Delight' subtly visible. High-end pet food advertising style, professional product photography, 4K, vibrant warm tones.",
     "16:9"),

    ("IMG-05", GPT_IMAGE_2,
     "Dramatic silhouette of a runner against a city skyline at sunrise. The runner is mid-stride on a hilltop, backlit by a golden-orange sunrise. City buildings in the background with soft morning mist. Athletic, motivational feel. Action sports photography style, cinematic backlighting, 4K, warm inspirational tones.",
     "16:9"),

    ("IMG-08", GPT_IMAGE_2,
     "Dreamy photo of a cherry blossom tunnel in Tokyo during peak bloom. Soft pink petals floating in the air, a stone path leading into the distance. Warm golden afternoon light filtering through the branches. Japanese aesthetic, peaceful and inviting. Travel advertisement style, 4K, pink and gold color palette, ethereal atmosphere.",
     "16:9"),

    # ── ACT 2: Character Scenes — Sarah (Cat Lover) ──
    ("IMG-03", NANO_BANANA_PRO,
     "Photo of an Asian woman, 28 years old, with a short black bob haircut, wearing a cozy beige oversized sweater, sitting on a light gray modern sofa in a warm living room. She is gently holding a Siamese cat with blue eyes on her lap. Evening warm lamp lighting from the left side. A large flat-screen TV in the background is softly glowing showing a pet food commercial. Comfortable home interior, lifestyle photography, soft natural tones, 4K, shallow depth of field.",
     "16:9"),

    ("IMG-04", NANO_BANANA_PRO,
     "Close-up photo of an Asian woman's hands (28 years old, short black bob hair partially visible) holding an iPhone in portrait orientation. The phone screen shows a colorful pet food advertisement with a Siamese cat image. She is sitting on a gray sofa, wearing a beige sweater. Warm indoor lighting. The focus is on the phone screen and her hands. Lifestyle mobile usage photography, 4K, warm tones, shallow depth of field.",
     "9:16"),

    # ── ACT 2: Character Scenes — Mike (Runner) ──
    ("IMG-06", NANO_BANANA_PRO,
     "Photo of a Caucasian man, 32 years old, with a short crew cut, athletic build, running on a modern treadmill in a well-equipped gym. He wears a dark gray running tank top and wireless earbuds. A large digital screen in front of the treadmill displays a running shoe advertisement with a sunrise silhouette. Modern gym interior with warm overhead lighting. Fitness lifestyle photography, action pose mid-run, 4K, energetic atmosphere.",
     "16:9"),

    ("IMG-07", NANO_BANANA_PRO,
     "Photo of a Caucasian man, 32 years old, with a short crew cut, wearing a navy blue office shirt with sleeves slightly rolled up. He is sitting at a modern office desk during lunch break, a sandwich beside him. His laptop screen shows a running gear landing page with product recommendations. Natural daylight from a window. Clean modern office environment. Casual work lifestyle photography, 4K, natural tones.",
     "16:9"),

    # ── ACT 2: Character Scenes — Yuki (Traveler) ──
    ("IMG-09", NANO_BANANA_PRO,
     "Photo of a Japanese woman, 27 years old, with long straight black hair, wearing white AirPods and a light blue denim jacket. She is standing in a Tokyo metro train car, holding a phone with both hands, looking at the screen with a gentle smile. The phone screen shows a cherry blossom travel advertisement. Other passengers softly blurred in the background. Japanese subway interior, evening commute lighting. Street photography style, 4K, cool urban tones with warm phone glow.",
     "16:9"),

    ("IMG-10", NANO_BANANA_PRO,
     "Photo of a Japanese woman, 27 years old, with long straight black hair, wearing a comfortable white cotton t-shirt and light pajama pants. She is reclining on a modern beige sofa at home, resting her chin on one hand with a dreamy, yearning expression. An iPad on her lap shows a Japanese food travel video (sushi plating visible on screen). Weekend afternoon, soft natural light from a large window. Cozy home interior, lifestyle photography, 4K, warm relaxed atmosphere.",
     "16:9"),

    # ── ACT 3: Global Montage (8 cities + Earth) ──
    ("IMG-11", GPT_IMAGE_2,
     "Night scene of Times Square, New York City. A massive LED billboard on a building prominently displays a vibrant English-language travel advertisement featuring cherry blossoms and 'Discover Tokyo' text. Pedestrians walking below, neon reflections on wet pavement. Cinematic night photography, 4K, vibrant saturated neon colors, urban energy.",
     "16:9"),

    ("IMG-12", GPT_IMAGE_2,
     "Shibuya Crossing in Tokyo, Japan. A giant digital screen on a building plays a Japanese cherry blossom travel advertisement with Japanese text. Cherry blossom elements enhanced in the ad. Busy pedestrian crossing with people in modern and traditional clothing. Evening golden hour light. Japanese urban photography, 4K, warm tones mixed with neon.",
     "16:9"),

    ("IMG-13", GPT_IMAGE_2,
     "Copacabana beach in Rio de Janeiro, Brazil. A young person relaxing on a colorful striped beach chair, holding a smartphone showing a Portuguese-language travel advertisement. Turquoise ocean waves in the background, white sand beach, palm trees. Bright sunny day, tropical paradise atmosphere. Travel lifestyle photography, 4K, vibrant tropical colors.",
     "16:9"),

    ("IMG-14", GPT_IMAGE_2,
     "Composite scene of three cities for a global montage: Left third shows a vibrant Lagos market street with a young Nigerian man on a motorcycle scrolling his phone showing a colorful ad. Center shows a modern Seoul subway car with a digital screen showing a Korean travel ad. Right third shows a cozy Berlin family living room (2 adults and a child on a sofa) watching TV with a German travel ad. Each scene has its own lighting and character. Cinematic triptych photography, 4K.",
     "16:9"),

    ("IMG-15", GPT_IMAGE_2,
     "Early morning scene at a Parisian café terrace. A classic French café with an awning, small round marble table, and ornate iron chair. A stylish woman sits with a MacBook, browsing a French-language travel landing page. The Eiffel Tower is softly visible in the misty background. Dawn golden light. A cup of café au lait on the table. Romantic Parisian atmosphere, travel lifestyle photography, 4K, warm golden and soft blue tones.",
     "16:9"),

    ("IMG-16", GPT_IMAGE_2,
     "View of Earth from low orbit in space. The planet slowly rotating showing continents. Eight specific city locations (New York, Tokyo, Rio, Lagos, Seoul, Berlin, Mumbai, Paris) glow with bright green-yellow light dots. Thin lines of light connect these cities forming a glowing network around the globe. Deep black space background with stars. The overall color theme uses acid green (#c0e463) for the glowing network. Cinematic space photography, 4K, dramatic and inspiring.",
     "16:9"),
]


def generate_image(img_id: str, model: str, prompt: str) -> dict:
    """Generate a single image via OpenRouter API."""

    # Build prompt with explicit image generation instruction
    if "gemini" in model:
        full_prompt = "Generate an image: " + prompt
    else:
        full_prompt = prompt

    payload = {
        "model": model,
        "messages": [{"role": "user", "content": full_prompt}],
    }

    # For Nano Banana / Gemini models, request image modality
    if "gemini" in model:
        payload["modalities"] = ["image", "text"]

    resp = requests.post(
        f"{BASE_URL}/chat/completions",
        headers=HEADERS,
        json=payload,
        timeout=180,
    )

    if resp.status_code != 200:
        return {"error": resp.status_code, "body": resp.text[:500]}

    # Try to parse JSON
    try:
        return resp.json()
    except Exception:
        pass

    # If not JSON, check if it's raw image data
    content_type = resp.headers.get("content-type", "")
    if "image" in content_type:
        # Raw image binary returned
        ext = "png"
        if "jpeg" in content_type or "jpg" in content_type:
            ext = "jpg"
        out_path = OUTPUT_DIR / f"{img_id}.{ext}"
        out_path.write_bytes(resp.content)
        return {"_raw_image_saved": str(out_path)}

    # Save raw response for debugging
    debug_path = OUTPUT_DIR / f"{img_id}_debug_response.txt"
    # Save first 2000 chars to avoid huge files
    debug_path.write_text(resp.text[:2000])
    return {"error": "non_json", "body": f"Saved debug to {debug_path.name}, content-type: {content_type}, length: {len(resp.text)}"}


def extract_and_save_image(img_id: str, response: dict) -> Optional[str]:
    """Extract image from API response and save to disk."""
    try:
        # Always save first response for debug
        debug_path = OUTPUT_DIR / f"{img_id}_raw_response.json"
        # Truncate large base64 data for readability
        debug_str = json.dumps(response, indent=2, default=str)
        if len(debug_str) > 5000:
            debug_path.write_text(debug_str[:5000] + "\n... (truncated)")
        else:
            debug_path.write_text(debug_str)

        # Try multiple response formats
        choices = response.get("choices", [])
        if not choices:
            print(f"  [!] No choices in response for {img_id}")
            return None

        message = choices[0].get("message", {})
        print(f"  [debug] message keys: {list(message.keys())}")

        # Format 1: message.images[] array
        # Actual format from OpenRouter:
        #   {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
        images = message.get("images", [])
        if images:
            img_data = images[0]
            b64 = None

            if isinstance(img_data, dict):
                # OpenRouter format: {"type":"image_url","image_url":{"url":"data:..."}}
                if "image_url" in img_data:
                    url = img_data["image_url"].get("url", "")
                elif "url" in img_data:
                    url = img_data["url"]
                elif "data" in img_data:
                    b64 = img_data["data"]
                    url = ""
                elif "b64_json" in img_data:
                    b64 = img_data["b64_json"]
                    url = ""
                else:
                    url = ""

                if not b64 and url:
                    if url.startswith("data:"):
                        b64 = url.split(",", 1)[1]
                    elif url.startswith("http"):
                        dl = requests.get(url, timeout=60)
                        if dl.ok:
                            out_path = OUTPUT_DIR / f"{img_id}.png"
                            out_path.write_bytes(dl.content)
                            return str(out_path)
                        return None
            elif isinstance(img_data, str):
                if img_data.startswith("data:"):
                    b64 = img_data.split(",", 1)[1]
                else:
                    b64 = img_data

            if b64:
                out_path = OUTPUT_DIR / f"{img_id}.png"
                out_path.write_bytes(base64.b64decode(b64))
                return str(out_path)
            else:
                print(f"  [!] Could not extract base64 from images[0]")
                return None

        # Format 2: content with image parts
        content = message.get("content", "")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    # image_url type
                    if part.get("type") == "image_url":
                        url_data = part.get("image_url", {}).get("url", "")
                        if url_data.startswith("data:"):
                            b64 = url_data.split(",", 1)[1]
                            ext = "png"
                            out_path = OUTPUT_DIR / f"{img_id}.{ext}"
                            out_path.write_bytes(base64.b64decode(b64))
                            return str(out_path)
                    # inline_data type
                    if "inline_data" in part:
                        b64 = part["inline_data"].get("data", "")
                        mime = part["inline_data"].get("mime_type", "image/png")
                        ext = mime.split("/")[-1].replace("jpeg", "jpg")
                        out_path = OUTPUT_DIR / f"{img_id}.{ext}"
                        out_path.write_bytes(base64.b64decode(b64))
                        return str(out_path)
        elif isinstance(content, str) and content.startswith("data:image"):
            b64 = content.split(",", 1)[1]
            out_path = OUTPUT_DIR / f"{img_id}.png"
            out_path.write_bytes(base64.b64decode(b64))
            return str(out_path)

        # Format 3: Check for URL-based image in content
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and part.get("type") == "image_url":
                    url = part.get("image_url", {}).get("url", "")
                    if url.startswith("http"):
                        img_resp = requests.get(url, timeout=60)
                        if img_resp.ok:
                            ext = "png"
                            out_path = OUTPUT_DIR / f"{img_id}.{ext}"
                            out_path.write_bytes(img_resp.content)
                            return str(out_path)

        # Save raw response for debugging
        debug_path = OUTPUT_DIR / f"{img_id}_raw_response.json"
        debug_path.write_text(json.dumps(response, indent=2, default=str))
        print(f"  [!] Unknown response format for {img_id}, saved raw to {debug_path.name}")
        return None

    except Exception as e:
        print(f"  [!] Error extracting image for {img_id}: {e}")
        return None


def main():
    print("=" * 60)
    print("Moboost Promo Video — Image Generation Round 1")
    print(f"Output: {OUTPUT_DIR}")
    print(f"Total images: {len(IMAGES)}")
    print("=" * 60)

    results = []
    for i, (img_id, model, prompt, aspect) in enumerate(IMAGES, 1):
        model_short = "NanaBanana" if "gemini" in model else "GPT-Img2"
        print(f"\n[{i}/{len(IMAGES)}] {img_id} ({model_short}) — {aspect}")
        print(f"  Prompt: {prompt[:80]}...")

        t0 = time.time()
        response = generate_image(img_id, model, prompt)
        elapsed = time.time() - t0

        if "error" in response:
            print(f"  x API Error {response['error']}: {response.get('body', '')[:200]}")
            results.append({"id": img_id, "status": "error", "detail": response.get("body", "")[:200]})
            if response["error"] == 429:
                print("  ... Rate limited, waiting 30s")
                time.sleep(30)
            continue

        # Check if image was already saved directly (raw binary response)
        if "_raw_image_saved" in response:
            saved_path = response["_raw_image_saved"]
            size_kb = os.path.getsize(saved_path) / 1024
            print(f"  OK Saved (raw): {Path(saved_path).name} ({size_kb:.0f} KB) in {elapsed:.1f}s")
            results.append({"id": img_id, "status": "ok", "path": saved_path, "time": f"{elapsed:.1f}s", "size": f"{size_kb:.0f}KB"})
            if i < len(IMAGES):
                time.sleep(2)
            continue

        saved_path = extract_and_save_image(img_id, response)
        if saved_path:
            size_kb = os.path.getsize(saved_path) / 1024
            print(f"  ✓ Saved: {Path(saved_path).name} ({size_kb:.0f} KB) in {elapsed:.1f}s")
            results.append({"id": img_id, "status": "ok", "path": saved_path, "time": f"{elapsed:.1f}s", "size": f"{size_kb:.0f}KB"})
        else:
            print(f"  ✗ Failed to extract image ({elapsed:.1f}s)")
            results.append({"id": img_id, "status": "extract_failed", "time": f"{elapsed:.1f}s"})

        # Small delay between requests to avoid rate limiting
        if i < len(IMAGES):
            time.sleep(2)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    ok = sum(1 for r in results if r["status"] == "ok")
    fail = len(results) - ok
    print(f"  Success: {ok}/{len(IMAGES)}")
    print(f"  Failed:  {fail}/{len(IMAGES)}")
    for r in results:
        icon = "✓" if r["status"] == "ok" else "✗"
        detail = r.get("path", r.get("detail", "unknown"))
        print(f"  {icon} {r['id']}: {r['status']} — {detail}")

    # Save results manifest
    manifest_path = OUTPUT_DIR / "generation_manifest.json"
    manifest_path.write_text(json.dumps(results, indent=2))
    print(f"\nManifest saved: {manifest_path}")


if __name__ == "__main__":
    main()
