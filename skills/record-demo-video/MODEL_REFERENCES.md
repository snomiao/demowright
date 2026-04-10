# Model References (as of 2026-04)

Background research backing the TTS and image-generation recommendations in `SKILL.md`. Re-check periodically — model rankings shift fast.

## Text-to-Speech

| Provider · Model | Strength | Notes |
|---|---|---|
| **ElevenLabs Eleven v3** | Most expressive; audio tags, dialogue mode, 70+ languages | Best raw quality; for real-time use prefer Flash v2.5 (~75 ms latency) |
| **OpenAI `gpt-4o-mini-tts`** | Natural-language style instructions, streaming | Token-priced ($0.60/1M text, $12/1M audio); 13 voices |
| **Google Gemini 2.5 TTS (Flash / Pro)** | Style/accent/pace/emotion via prompt | Returns raw PCM — must wrap in WAV header (see `template/generate-narration.py`) |
| Microsoft Azure Dragon HD Omni | Enterprise-grade | — |
| Amazon Polly Generative | AWS ecosystem | — |

**Sources**
- [Latest TTS Model Comparison 2026 — Greeden](https://blog.greeden.me/en/2026/03/12/latest-tts-model-comparison-2026-the-definitive-guide-to-choosing-by-use-case-across-gemini-azure-elevenlabs-openai-amazon-polly-and-oss/)
- [Best TTS APIs in 2026 — Speechmatics](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)
- [Gemini 2.5 TTS vs ElevenLabs head-to-head — Podonos](https://www.podonos.com/blog/gemini-vs-elevenlabs)
- [ElevenLabs vs OpenAI TTS — Vapi](https://vapi.ai/blog/elevenlabs-vs-openai)
- [TTS API Pricing 2026 — LeanVox](https://leanvox.com/blog/tts-api-pricing-comparison-2026)
- [8 Best TTS APIs for Developers 2026 — Inworld](https://inworld.ai/resources/best-text-to-speech-apis)

## Image generation (thumbnails)

| Provider · Model | Strength |
|---|---|
| **OpenAI GPT Image 1.5** | Photorealism; replaces DALL-E 3; ~4× faster than predecessor |
| **Google Imagen 3 / Ideogram 2.0** | Best in-image text rendering (titles, labels, mockups) |
| **FLUX.1.1 Pro** | Highest technical quality, ~4.5 s generation |
| **Midjourney v7** | Aesthetic / artistic interpretation |
| Adobe Firefly Image 3 | Commercially-safe licensing, Adobe workflow |
| FLUX.1 Schnell / Recraft v3 | Speed-optimized |

**Sources**
- [The 9 Best AI Image Generation Models in 2026 — Gradually](https://www.gradually.ai/en/ai-image-models/)
- [Midjourney vs DALL-E vs Gemini Imagen 2026 — FreeAcademy](https://freeacademy.ai/blog/midjourney-vs-dalle-vs-gemini-imagen-comparison-2026)
- [Best AI Image Models 2026 — TeamDay](https://www.teamday.ai/blog/best-ai-image-models-2026)
- [AI Image Pricing 2026: Gemini vs OpenAI — IntuitionLabs](https://intuitionlabs.ai/articles/ai-image-generation-pricing-google-openai)
- [Gemini Image Generation Complete Guide 2026 — LaoZhang](https://blog.laozhang.ai/en/posts/gemini-image-generation-complete-guide)

## Why the template defaults to Gemini

Both TTS and image generation live behind a single `GOOGLE_GENERATIVE_AI_API_KEY`, which minimizes setup friction for a brand-new repo. For maximum voice quality, swap `generate-narration.py` to ElevenLabs Eleven v3; for the cleanest in-image text on the thumbnail, swap `generate-thumbnail.py` to Imagen 3 or GPT Image 1.5.
