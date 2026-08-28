# AGENTS.md - Project Development & Operational Directives for AI Agents

This document defines the strict, binding development principles, architecture guidelines, and operational SOPs for all AI agents working on the `line-bot-gpt` codebase.

---

## 🚨 1. Mandatory Documentation Discipline (嚴禁漏更文檔鐵律)
Whenever any feature, tool, API endpoint, configuration, or bugfix is implemented, the agent **MUST PROACTIVELY UPDATE**:
1. **`CHANGELOG.md`**: Follow Keep a Changelog / SemVer format, document new versions, features, changes, and fixes immediately.
2. **`README.md`**: Update feature summaries, environment variables, usage guides, and configuration examples.
3. **`example.env`**: Keep all environment variable keys and descriptions fully aligned.
> **DO NOT wait for the user to ask or remind you.** Updating documentation is part of the definition of "done" for every single task.

---

## 📖 2. David888 Wiki AI Publishing Architecture (Wiki 核心架構原則)
- **Target User**: David888 Wiki is designed **PRIMARILY FOR LLM / AI AGENTS**, NOT for humans to manually type raw Markdown commands in chat.
- **Mandatory Document Structure Rule (SKILL.md 鐵律)**:
  - **Line 1 MUST be `# Document Title`**: AI agents MUST output pure Markdown starting immediately with a Level-1 title `# Title` (or optional YAML frontmatter `---`). **NEVER** prefix the article with conversational chatter (e.g. ❌ `好的，這是為您整理的... \n\n# 標題`).
  - **`> Executive Summary` & `[TOC]`**: Placed immediately AFTER the Level-1 `# Title`.
- **Extended Markdown Syntax Support**:
  - **Text Highlighting & Colors**: `==highlighted text==`, `[color=red]red text[/color]`, `[bg=yellow]yellow bg[/bg]`.
  - **Code Blocks**: Line numbers gutter ```` ```js=1 ````, filename tabs ```` ```js [app.js] ```` with one-click copy.
  - **GitHub Alerts**: `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`.
  - **Academic Footnotes & Citations**: Standard `[^1]` with hover popovers, inline `^[inline note]`, Pandoc citations `[@key]`.
  - **Multi-Column Layouts**: `<div class="two-column-layout">...</div>` & `<div class="three-column-layout">...</div>`.
  - **Mermaid Guard**: All node labels MUST be in double quotes `NODE["Label"]`; NEVER put unquoted URLs or slashes in brackets `PROXY["/api/proxy"]`.
- **20 Bundled Themes**: `ayu-light`, `bauhaus`, `botanical`, `catppuccin-latte`, `catppuccin-macchiato`, `claude-canvas`, `green-simple`, `kanagawa`, `neo-brutalism`, `newsprint`, `notion-clean`, `organic`, `playful-geometric`, `professional`, `retro`, `shopify-mint`, `sketch`, `terminal`, `tokyo-night`, `x-ai`.
- **Agentic Workflow**:
  - When the user requests in-depth analysis, research reports, tutorials, comparisons, architecture docs, business proposals, or complex answers:
    1. LLM / Agent writes the complete, rich, structured Markdown article following the above rules.
    2. LLM / Agent autonomously publishes the article to `wiki.david888.com` via `wikiHelper.publishNote(...)` or the OpenAI tool `publish_to_wiki`.
    3. The LINE reply MUST be a concise, high-level executive summary (150-250 chars) delivered via a rich LINE Flex Message Card.
    4. Provide the user with the 3-in-1 reading experience:
       - 🌐 **Web Reader**: Public read-only `shareUrl` (`https://wiki.david888.com/share/<id>`).
       - 📑 **2D Slide Deck**: Slidev-Lite 2.0 interactive presentation (`shareUrl + '/present'`).
       - 📚 **eBook Dual-Pane Mode**: Interactive book reader (`shareUrl + '/book'`).

---

## 📦 3. 888box Asset Management Architecture (888box 雲端資產管理架構)
- **Multi-Endpoint High-Availability Routing**:
  - Primary: `https://box.david888.com`
  - Fallback 1: `https://box.glsoft.ai`
  - Fallback 2: `https://box.aiurl.tw`
- **Auto-Ingestion & CDN Storage**:
  - Gemini generated and edited images MUST automatically upload to 888box for CloudFront CDN distribution and WebP optimization.
  - LINE incoming videos (`video`) and documents/binaries (`file`) MUST automatically upload to 888box.
  - Remote media URLs can be cached/ingested via `boxHelper.uploadFromUrl(...)` or LLM tool `save_asset_to_888box`.
  - Podcast RSS feeds (`/rss/video.xml` & `/rss/audio.xml`) are generated automatically.

---

## 🚀 4. CI/CD & Production Deployment SOP (伺服器部署規範)
- **Production Server**: `ubuntu@dns.glsoft.ai` (AWS Graviton ARM64 / `aarch64` Linux).
- **Multi-Architecture Builds**: All GitHub Actions workflows (`.github/workflows/docker-publish.yml`) MUST include `docker/setup-qemu-action@v3` and `platforms: linux/amd64,linux/arm64`.
- **Watchtower Automated Deployment**:
  - Push changes to `main` branch -> triggers GitHub Actions build -> pushes multi-arch image to Docker Hub `tbdavid2019/line-bot-gpt:latest`.
  - Watchtower on `ubuntu@dns.glsoft.ai` automatically polls Docker Hub every 60s, updates running containers, cleans dangling images, and maintains high availability.
  - Monitored services: `line-bot-gpt`, `stirling-pdf` (port 8822), `ai-hedge-fund-api`.

---

## 🌐 5. Zero-Excuse & Live Web Verification (零幻覺與即時檢索鐵律)
- Whenever answering factual questions, analyzing companies, market quotes, or current technical specifications, **ALWAYS use tools (`search_web`, `read_url_content`, 2MD endpoints) to verify live data first**. Never fabricate or guess.
