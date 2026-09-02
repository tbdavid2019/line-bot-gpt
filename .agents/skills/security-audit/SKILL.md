---
name: security-audit
description: 7-Layer full repository security audit framework for line-bot-gpt, covering secrets leakage, server & API architecture, SSRF defense, client-side Flex Message URI sanitization, dependency CVEs, HTTP security headers, and timing-safe operations.
---

# 🛡️ line-bot-gpt 7-Layer Security Audit Framework

Use this skill to audit, harden, and verify the `line-bot-gpt` repository across all 7 layers of application, API, AI agent, and infrastructure security.

## 📋 Audit Layers

### Layer 1: 🔑 Secrets & Credentials Exposure
- Scrutinize Git history and working tree for hardcoded API keys, tokens, or credentials.
- Ensure `.gitignore` and `.dockerignore` comprehensively exclude `.env`, `.env.*`, `service-account-key.json`, `*.pem`, `*.key`, `*.pfx`, `*.crt`, `*.cert`, `data/*.json`, `data/*.tmp`, `logs/`, `*.log`.
- Ensure `.dockerignore` is committed to version control and not ignored.

### Layer 2: 🛡️ API Endpoints & Server Architecture
- **SSRF Mitigation**: Enforce `isSafeUrl()` on all outgoing fetch and axios requests (`search_helper.js`, `box_helper.js`, `wiki_helper.js`, and URL auto-fetch in `index.js`).
- Block private IP ranges (RFC 1918 / RFC 3927), localhost / loopback (`127.0.0.1`, `::1`), and cloud metadata services (`169.254.169.254`, `metadata.google.internal`, `100.100.100.200`).
- **Resource Timeouts**: All external HTTP requests must have bounded `AbortSignal.timeout(ms)`.

### Layer 3: 🧠 AI & MCP Guardrails
- Validate Session IDs and User IDs (`securityHelper.isValidId`) and protect memory caches against Object prototype pollution (`hasOwnProperty`).
- Prevent leaking raw backend stack traces or internal server error details to end users.

### Layer 4: 💻 Client-side Security & Data Storage
- **URI Sanitization**: Enforce `securityHelper.sanitizeUri` on all LINE Flex Message actions (`uri`) to prevent dangerous schemes (`javascript:`, `data:`, `file:`).
- Validate all URL references in Flex Carousel cards and Buttons.

### Layer 5: 📦 Supply Chain & Dependency CVEs
- Ensure `npm audit` reports **0 vulnerabilities**.
- Lock package versions via `package-lock.json` and Docker `npm ci --omit=dev`.
- Run container as non-root user (`USER node`).

### Layer 6: 🌐 HTTP Security Headers & Infrastructure
- Set standard security headers on Express responses:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `Cross-Origin-Opener-Policy: same-origin`
- Disable Express signature header: `app.disable('x-powered-by')`.

### Layer 7: 📐 Quantitative, URL Parsing & Timing Safety
- Use `securityHelper.escapeRegExp` when building dynamic regex patterns to eliminate ReDoS.
- Use SHA-256 pre-hashed buffers before `crypto.timingSafeEqual` in authentication checks.
