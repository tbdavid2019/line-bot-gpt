# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.1] - 2026-08-27

### 🛡️ Security & Robustness
- **Multi-Layer Pseudo Tool Call Interceptor (`wiki_helper.extractPseudoWikiCall`)**:
  - Intercepts and parses raw unexecuted pseudo tool call strings (e.g. `[CALL:/wiki ...]`, `[CALL:wiki ...]`, `<tool_call>...</tool_call>`, ````json {"name": "publish_to_wiki"} ````).
  - Automatically extracts the slug, title, and Markdown content from the leaked string, publishes the note to David888 Wiki, and sends the user a clean Flex message.
  - Strips any leftover technical pseudo-call tags before delivering messages, completely preventing raw code or pseudo-syntax leakage in LINE chat.
  - Added user intent trigger (`/wiki|知識庫|寫到wiki/i`) so requests like "你透過 david888 wiki 寫一個..." always publish to Wiki seamlessly.
  - Unified voice message (`audio`) handling with the same multi-layer Wiki publishing engine and tool calling.

---

## [1.3.0] - 2026-08-27

### 🚀 Added
- **LLM-Driven Autonomous Wiki Publishing Engine (`wiki_helper.js` & David888 Wiki)**:
  - **OpenAI Tool Calling (`publish_to_wiki`)**: LLM can autonomously publish structured, long-form Markdown articles (complete with `[TOC]`, Mermaid diagrams, tables, code blocks, footnotes) directly to David888 Wiki.
  - **Smart Markdown Auto-Publisher**: Automatic fallback detection that intercepts long-form analytical answers (> 600 chars with section headers), publishes them to Wiki, and delivers an executive summary + interactive LINE Flex card.
  - **3-in-1 Reading Experience**: Every published article includes:
    - 🌐 **Web Reader**: Public read-only `shareUrl` (`https://wiki.david888.com/share/<id>`).
    - 📑 **2D Slide Deck**: Slidev-Lite 2.0 interactive presentation (`shareUrl + '/present'`).
    - 📚 **eBook Dual-Pane Mode**: Interactive book reader (`shareUrl + '/book'`).
  - **Taiwan Legal LLM Auto-Publisher**: Long-form legal analysis is automatically published to Wiki with professional formatting and disclaimer, avoiding LINE text truncation.
  - **Webpage to Markdown Parser**: Integrates with 2md.aiurl.tw / Wiki parse API to convert external URLs into clean Markdown.
  - **Manual Wiki Utility Commands**: `!wiki <path> <content>`, `!wiki parse <url>`, `!wiki read <path>`, `!wiki append <path> <content>`, and `!wiki`.

- **888box Multi-Endpoint Cloud Asset Management (`box_helper.js`)**:
  - **High-Availability Multi-Endpoint Failover**: Seamless failover across Primary (`https://box.david888.com`), Fallback 1 (`https://box.glsoft.ai`), and Fallback 2 (`https://box.aiurl.tw`).
  - **Automatic AI Image Cloud Storage**: Gemini generated and edited images are automatically stored on 888box with CloudFront CDN distribution and WebP optimization.
  - **LINE Media Ingestion**:
    - Automatic video ingestion (`event.message.type === 'video'`) to 888box with CDN playback cards.
    - Automatic file ingestion (`event.message.type === 'file'`) for PDF, DOCX, archives, and binaries.
    - Image selection menu option `☁️ 存入 888box`.
  - **LLM Tool (`save_asset_to_888box`)**: LLM can autonomously save remote media URLs to 888box.
  - **Podcast RSS Integration**: Automatic RSS subscription links for audio and video feeds.
  - **Commands**: `!box <url>`, `!save <url>`, `!轉存 <url>`, `!下載 <url>`, `!box stats`, `!box podcast`.

- **Automated Multi-Arch CI/CD & Watchtower Deployment**:
  - Configured GitHub Actions with QEMU for `linux/amd64` and `linux/arm64` (AWS Graviton) Docker builds.
  - Reconfigured Watchtower on production server `ubuntu@dns.glsoft.ai` with 60-second polling interval and automatic old image pruning.
  - Automated maintenance for `line-bot-gpt`, `stirling-pdf` (v2.14.3, port 8822), and `ai-hedge-fund-api`.

### 🔄 Changed
- Increased LLM maximum output tokens (`max_tokens`) to 4,000 to allow exhaustive long-form report generation.
- Updated `選擇服務` service menus to include `📦 888box 雲端` and `📖 David888 Wiki`.
- Upgraded `example.env` with `BOX_BASE_URL`, `BOX_FALLBACK_URLS`, `BOX_API_TOKEN`, and `WIKI_BASE_URL`.

---

## [1.2.0] - 2026-08-20

### 🚀 Added
- ** 대동 (大同) Electric Cooker Recipe Assistant**: RAG semantic search with ChromaDB and OpenAI embeddings (`tatung_recipes_51_634.jsonl`).
- **Location-Based Nearby Facilities Search**: Google Places API integration for Gas stations, Parking, Convenience stores, Cafes, Restaurants, and ATMs.
- **ASR Audio Transcription**: Multimodal voice transcription via Groq Whisper and Gemini ASR.

---

## [1.1.0] - 2026-08-10

### 🚀 Added
- **Google Gemini 2.5 Flash Vision Integration**:
  - Image analysis (multimodal visual QA).
  - Conversational image generation and AI image editing.
  - Google Cloud Storage asset bucket integration.

---

## [1.0.0] - 2024-09-01

### 🚀 Added
- Initial release with LINE Messaging API and OpenAI GPT-4o integration.
- Divination services: Book of Answers, Tang Poetry, Senso-ji Fortune Omikuji, Qi Men Dun Jia.
- Central Weather Administration weather alerts and Taiwan Legal LLM consultation.
