#!/usr/bin/env python3
"""Generate a 16:9 YouTube thumbnail using Gemini image generation.
Reads GOOGLE_GENERATIVE_AI_API_KEY from env or .env.local (searches upward).
Edit PROMPT below to describe your tool.
"""
import os, base64, pathlib, sys, requests

PROMPT = (
    "YouTube tech tutorial thumbnail, 16:9 aspect ratio, dark background, "
    "bold high-contrast title text, terminal and browser window mockups, "
    "clean modern design, no watermark."
)
OUTPUT = pathlib.Path(__file__).parent / "thumbnail.jpg"

api_key = os.environ.get("GOOGLE_GENERATIVE_AI_API_KEY")
if not api_key:
    here = pathlib.Path(__file__).parent
    for d in [here, *here.parents]:
        env = d / ".env.local"
        if env.exists():
            for line in env.read_text().splitlines():
                if line.startswith("GOOGLE_GENERATIVE_AI_API_KEY="):
                    api_key = line.split("=", 1)[1].strip("\"'")
            break
if not api_key:
    sys.exit("GOOGLE_GENERATIVE_AI_API_KEY not found")

url = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"gemini-3-pro-image-preview:generateContent?key={api_key}"
)
body = {
    "contents": [{"parts": [{"text": PROMPT}], "role": "user"}],
    "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
}

resp = requests.post(url, json=body, timeout=120)
resp.raise_for_status()
for part in resp.json()["candidates"][0]["content"]["parts"]:
    if "inlineData" in part:
        OUTPUT.write_bytes(base64.b64decode(part["inlineData"]["data"]))
        print(f"Wrote {OUTPUT} ({OUTPUT.stat().st_size // 1024}KB)")
        break
else:
    sys.exit("No image in response")
