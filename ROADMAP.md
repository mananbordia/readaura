# ReadAura — Roadmap

A pragmatic roadmap, organized by what unblocks an open-source release, then what makes the product genuinely better, then ambitious bets.

---

## Phase 0 — Where we are today

- Next.js 16 App Router + React 19 + TypeScript scaffold, Tailwind v4 with shadcn-style primitives
- **Stateless**: every document, edit, and saved explanation lives in the user's browser IndexedDB. No database, no filesystem on the server.
- PDF / DOCX / TXT viewer with selection-anchored AI explanations (NVIDIA NIM, Llama 3.3 70B) and multi-turn saved threads
- PDF.js text-layer rendering preserves original PDF layout; DOCX renders in-browser via mammoth
- TTS read-aloud with paragraph highlighting, speed control, click-to-jump, table/image pause
- Three themes (light / dark / CRT) with anti-flash inline script
- NVIDIA API key lives in the user's localStorage (Settings dialog); env-var fallback for shared deployments
- Library polish: search, sort, tag autocomplete, bulk tag edit, mobile-friendly layout
- Deployed on Vercel (https://readaura-ai.vercel.app), GitHub Actions CI on every PR

---

## Phase 1 — OSS launch (must-have)

### 1.3 Distribution
- [ ] Demo GIF / screenshots in the README.

### 1.4 Quality basics
- [ ] Vitest setup with smoke tests for: storage layer, explain rate-limit logic, DOCX/PDF conversion.
- [ ] Playwright smoke test: upload → view → highlight → save explanation.
- [ ] Error boundary on the library page so a bad doc doesn't break the whole app.

---

## Phase 2 — Make it genuinely useful (next 4–8 weeks of part-time work)

### 2.1 LLM provider abstraction
NVIDIA is the only supported provider today. Move to a single `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `MODEL` env-var trio so users can plug in OpenAI, Groq, Together, OpenRouter, Anthropic-via-proxy, or local Ollama. Ship NVIDIA as the default preset.

### 2.2 Library improvements
- [ ] Reading progress per document (track last-read paragraph, sort by last-opened).
- [ ] Ranked / fuzzy search instead of the current substring filter.

### 2.3 Annotations beyond explanations
- [ ] Plain highlights without an AI conversation (color-coded).
- [ ] Per-document notes (a sidebar markdown pad scoped to a doc).
- [ ] Export all annotations for a document as Markdown.

### 2.4 AI features
- [ ] "Summarize this document" action (full-doc summary in the drawer).
- [ ] "Chat with this document" — RAG over the full text, separate from selection-explain.
- [ ] Auto-suggest 3 follow-up questions after the first explanation turn.

### 2.5 TTS quality of life
- [ ] Resume from last paragraph on reload.
- [ ] Skip-back / skip-forward by paragraph (keyboard `[` / `]`).
- [ ] Export the current document as an MP3 audiobook.

### 2.6 UX polish
- [ ] Keyboard shortcut overlay (`?` to show all bindings).

---

## Phase 3 — Ambitious bets

Big enough to deserve a separate design doc before starting.

### 3.1 Multi-user mode (opt-in)
Pluggable auth (NextAuth-compatible) for households or small teams self-hosting. Keep single-user as the default.

### 3.2 Cloud sync
A small sync server (or a Litestream-style backup-to-S3 pattern) so a user can move between desktop and laptop without losing their library.

### 3.3 Source ingestion
- [ ] Web article ingestion (paste URL → Readability extraction → save as doc).
- [ ] EPUB support.
- [ ] arXiv / SSRN paper picker (paste an arXiv ID, auto-import PDF + metadata).

### 3.4 Spaced repetition
Turn saved explanations into flashcards reviewable on a schedule. Closes the loop between "I highlighted this because it confused me" and "I actually remember it."

### 3.5 Local-only LLM mode
First-class support for Ollama / llama.cpp so the whole stack runs offline. Document VRAM/RAM trade-offs for common models.

---

## Non-goals (for now)

- Real-time collaborative annotation
- A native mobile app (the responsive web viewer is enough)
- A hosted multi-user SaaS — the deployed Vercel instance is a convenience demo; ReadAura's design point is local-first and self-hostable
