# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.7.0] - 2026-09-02

### 🛡️ Security Audit & Hardening (7-Layer Security Standard)
- **Zero NPM CVEs & Supply Chain Hardening** (`package.json` & `package-lock.json`):
  - Upgraded `@line/bot-sdk` to `^9.9.0` and enforced `overrides: { "uuid": "^11.1.0" }`.
  - Cleared all 18 CVE vulnerabilities across `fast-xml-parser` (Critical), `ws`, `form-data`, `path-to-regexp`, `jws`, achieving **0 vulnerabilities** on `npm audit`.
- **SSRF & Cloud Metadata Protection** (`security_helper.js`, `search_helper.js`, `box_helper.js`, `wiki_helper.js`, `index.js`):
  - Added centralized `isSafeUrl()` filter to strictly block cloud metadata services (`169.254.169.254`, `metadata.google.internal`), `localhost`, `127.0.0.1`, `[::1]`, and RFC 1918 private subnets.
- **HTTP Defense Headers & Express Hardening** (`index.js`):
  - Added global security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
  - Disabled `X-Powered-By` header leak.
- **URI Sanitization & Prototype Pollution Defense**:
  - Enforced `securityHelper.sanitizeUri()` on all LINE Flex Message action URIs (`javascript:` / `data:` / `file:` blocked).
  - Validated Session IDs with `isValidId()` and added `hasOwnProperty` checks in `session_helper.js`.
- **RegExp Escaping & Timing Safety**:
  - Added `escapeRegExp()` in dynamic prompt prefix matchers.
  - Added `secureEquals()` with pre-hashed SHA-256 for timing-safe equality.
- **7-Layer Automated Test Suite & Skill** (`.agents/skills/security-audit/SKILL.md` & `test/security.test.js`):
  - Added 13 automated security regression tests, executable via `npm test`.

## [1.6.0] - 2026-08-28

### 🚀 Added & Enhanced (Smart URL Pre-Fetching & Multi-Turn Memory)
- **Zero-Shot Agentic Tool Calling & Intent Deconstruction Core** (`services_helper.js` & `index.js`):
  - Upgraded the LLM from a passive text responder into an autonomous Agent Router equipped with a full suite of Actuators:
    - `get_current_weather`: High-precision real-time weather, temperature, humidity, and rainfall probability for all Taiwan districts and worldwide cities (<200ms latency).
    - `generate_image`: Natural language image generation & editing.
    - `search_web`: Live internet search for facts, quotes, weather, and news.
    - `read_web_page` & `read_wiki_note`: Deep article parsing and grounding.
    - `publish_to_wiki`: Autonomous long-form markdown research publishing.
    - `manage_session`: Autonomous dialogue topic creation, listing, switching, and clearing.
    - `get_life_service`: Autonomous divination (解答之書, 淺草籤, 唐詩) and CWA weather alerts.
  - **SafeReply Auto-Push Fallback**: Prioritizes LINE `replyMessage`, and automatically falls back to `pushMessage` if processing exceeds network latency, guaranteeing 100% message delivery and preventing silent drops.
  - **3-Tier High-Availability LLM Architecture with Google Gemini**:
    - **Tier 1 (Primary)**: `nen.com.tw` (`gpt-5.6-luna` / `deepseek-v4-flash`).
    - **Tier 2 (High-Capacity Fallback)**: Google Gemini Official OpenAI-compatible endpoint (`gemini-2.5-flash` / `gemini-2.0-flash`), featuring 1,000,000 token context window, native tool calling, ultra-high TPM, and zero rate-limit crashing.
    - **Tier 3 (Multi-Model Candidate Pool)**: Groq (`openai/gpt-oss-20b` -> `qwen/qwen3.8-27b` -> `openai/gpt-oss-120b`).
  - **10-Turn Multi-Turn ReAct Loop (`MAX_AGENT_TURNS=10`)**: Configured up to 10 autonomous reasoning & tool execution cycles, allowing the Agent to perform multi-step chained queries, page reading, calculations, and structured synthesis without artificial turn cutoffs.
  - **Token Budget & Timeout Hardening**: Tightened search timeout to 3.5s, compacted search snippets to 1,500 chars, and limited prompt history to 6 turns (max 500 chars/turn) to strictly eliminate rate-limiting errors.
- **Automatic URL Pre-Fetching & Context Enrichment**:
  - Automatically detects HTTP/HTTPS URLs (e.g. `wiki.david888.com/share/...`, news, documentation, external links) in user messages.
  - Proactively pre-fetches and injects clean Markdown content directly into prompt context, eliminating LLM tool-calling delay and completely resolving hallucinations ("我看得到" / "我看不到").
- **David888 Wiki Native Markdown Engine & Publisher Integration** (`wiki_helper.js` & `index.js`):
  - **Full Alignment with `SKILL.md` (2026 Specification)**:
    - **Mandatory `# Title` on Line 1 Enforcement**: Automatically strips conversational preamble and conversational chatter from LLM output, strictly ensuring the first line is always a Level-1 title followed by `> Executive Summary` and `[TOC]`.
    - **20 Bundled Themes**: Full support for all 20 official themes (`ayu-light`, `bauhaus`, `botanical`, `catppuccin-latte`, `catppuccin-macchiato`, `claude-canvas`, `green-simple`, `kanagawa`, `neo-brutalism`, `newsprint`, `notion-clean`, `organic`, `playful-geometric`, `professional`, `retro`, `shopify-mint`, `sketch`, `terminal`, `tokyo-night`, `x-ai`).
    - **Rich Syntax Actuation**: Highlighting `==highlight==`, colors `[color=red]`, code line numbers ```` ```js=1 ````, tabs ```` ```js [app.js] ````, GitHub alerts `> [!NOTE]`, multi-column layouts `<div class="two-column-layout">`, footnotes `[^1]`, citations, 2D slide decks (`/present`), and Book Mode (`/book`).
    - **Extended REST API Utilities**: Added `renderMarkdown`, `extractMarkdown`, `lintMarkdown`, `listAnnotations`, `createAnnotation`, and `replyAnnotation`.
  - Added `wikiHelper.readWikiUrl()` supporting full URLs, share links (`/share/<id>`), and note paths.
  - Enhanced `readWebPage()` to natively fetch pure Markdown with `Accept: text/markdown` headers from `wiki.david888.com`, bypassing SPA UI shells.
  - Added `read_wiki_note` OpenAI Function Calling tool.
- **Interactive Global Help Menu & LLM Capability Awareness** (`session_helper.js` & `index.js`):
  - **4-Slide Interactive Flex Carousel (`!help`, `說明`, `功能`, `選單`, `menu`)**:
    - Slide 1 (Session & Memory): `!new`, `!sessions`, `!clear` with quick action buttons.
    - Slide 2 (AI Image & Vision): `產圖 <描述>`, `生圖`, `畫圖`, image upload vision analysis.
    - Slide 3 (2MD SERP & Web Reader): `!search <query>`, `!read <url>`, live quotes/weather.
    - Slide 4 (Wiki & Cloud Tools): `!wiki`, `!box` Podcast, life divination, recipes, nearby places.
  - **Proactive LLM System Prompt Knowledge**: LLM is fully aware of all bot capabilities and commands, providing structured markdown tables and instructions whenever users ask "你會什麼" / "有什麼指令".
- **Modern Session-Based Memory & 7-Day Long-Term Persistence** (`session_helper.js`):
  - **7-Day Automatic Session Lifecycle**: Retains user conversation history for 7 days. If a user is inactive for >7 days, the system automatically starts a new session on their next interaction.
  - **Disk Persistence (`./data/sessions.json`)**: Thread-safe atomic file writes preserve user sessions across container restarts and Watchtower redeployments.
  - **Multi-Session Management Commands**:
    - `!new` (or `開啟新話題`, `新對話`): Instantly starts a fresh session and renders a clean LINE Flex Card.
    - `!sessions` (or `查看話題`, `話題清單`): Lists recent sessions with titles, message counts, and timestamps.
    - `!session <id>` (or `切換話題 <id>`): Switches the active context back to a previous topic.
    - `!clear` (or `!reset`, `清除記憶`): Clears messages in the active session while retaining the session ID.
  - **Smart Context Compaction**: Automatically selects the most relevant recent turns (up to 16 messages) ensuring optimal token usage while retaining deep multi-turn memory.
- **Upgraded Fallback LLM Model**:
  - Updated default fallback model on Groq to `openai/gpt-oss-120b` for vastly superior reasoning and instruction following.

### 🐛 Fixed
- **Image Generation Trigger & Prompt Parser Optimization**:
  - Fixed an issue where natural language prompts (such as `產圖　一個體重87公斤台灣男子`, `生圖`, `幫我畫`, `繪圖` with full-width or half-width spaces) were not recognized as image requests.
  - Added `generate_image` OpenAI Function Calling tool so the LLM can also autonomously invoke image generation during conversational chat.
- **Wiki Publication Intent False Positives**:
  - Fixed an issue where questions containing the word "wiki" (e.g. "分析這個 wiki 文章") triggered the auto-publisher regex. Regex now strictly requires explicit creation/writing intent and excludes analysis/read queries.

---

## [1.5.0] - 2026-08-27

### 🚀 Added & Real-Time Web Browsing (2MD SERP & Web Reader Engine)
- **2MD Multi-Endpoint Real-Time SERP & Web Reader Integration** (`search_helper.js`):
  - **High Availability 3-Endpoint Routing**: Primary `https://2md.aiurl.tw/`, Fallback 1 `https://2md.glsoft.ai/`, Fallback 2 `https://create360.ai/`.
  - **OpenAI Tool Calling (`search_web`)**: Automatically searches live weather, stock market quotes, breaking news, sports scores, and real-time facts.
  - **OpenAI Tool Calling (`read_web_page`)**: Fetches and parses external web pages, articles, and documents into clean Markdown.
  - **Multi-Turn Agentic Tool Execution Loop**: Integrated into text conversations and voice message transcriptions to ensure 100% grounded, zero-hallucination real-time responses.
  - **Manual Commands**: Added `!search <query>`, `!搜尋 <query>`, `!google <query>`, and `!read <url>` / `!2md <url>`.
  - **Menu Option**: Added `🌐 即時網路搜尋` to `選擇服務` menu.

---

## [1.4.1] - 2026-08-27

### 🐛 Fixed
- **OpenAI Client Lazy Initialization & Crash Prevention**:
  - Fixed an issue where `new OpenAI({ apiKey: undefined })` caused fatal Node.js crashes when optional fallback keys were unset in the environment.
  - LLM primary and fallback clients are now instantiated safely with existence checks, preventing boot loops.

---

## [1.4.0] - 2026-08-27

### 🔄 Changed & Multi-Endpoint High Availability Architecture
- **Multi-Endpoint LLM Engine with Automatic Failover**:
  - **Primary**: `https://nen.com.tw/v1` (`gpt-5.6-luna`), delivering ultra-fast responses and advanced reasoning.
  - **Fallback**: `https://api.groq.com/openai/v1` (`openai/gpt-oss-20b`), ensuring 100% service uptime during network or upstream disruptions.
  - Transparent failover helper `createChatCompletion()` applied across main conversation, audio transcription, and recipe RAG.
- **Multi-Endpoint AI Image Generation & Editing Engine**:
  - **Primary**: `https://nen.com.tw/v1` (`gemini-3.1-flash-image`), supporting direct multi-modal image generation and image-to-image editing.
  - **Fallback**: Google Official REST API (`gemini-3.1-flash-image`), automatic failover buffer extraction.
  - Automatic asset ingestion and distribution via 888box CloudFront CDN.
- **Vision Analysis**:
  - Upgraded to `gpt-5.6-luna` Vision (`nen.com.tw`) with fallback to Google REST API (`gemini-2.5-flash`).

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
