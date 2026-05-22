# ReadAura — Roadmap

A pragmatic roadmap, organized by what unblocks an open-source release, then what makes the product genuinely better, then ambitious bets. Tracking issues will live on GitHub once the repo is published — this file captures the shape of the work.

---

## Phase 0 — Where we are today

- Next.js 16 App Router + React 19 + TypeScript scaffold
- SQLite (better-sqlite3) auto-init with 4 tables; seeded `local` user
- Reports feature ported as-is: upload, view (PDF/DOCX/TXT), inline edit, drag-and-drop
- AI explain-on-selection with multi-turn chat (NVIDIA NIM, Llama 3.3 70B)
- Saved explanations drawer with thread continuation
- TTS read-aloud with paragraph highlighting, speed control, click-to-jump, table/image pause
- No auth — single-user local-first
- Clean `tsc` build; `npm run dev` boots

---

## Phase 1 — OSS launch (must-have)

The bar is: a stranger can `git clone`, fill one env var, and have a tool they actually want to use.

### 1.1 Remove finance bleed-through
- [ ] Rename region tabs (`US / IN / AE`) → user-defined **collections** (or drop the column and use tags only).
- [ ] Audit all UI strings/icons for finance references; replace with neutral reading-tool language.
- [ ] Rename `research_reports` table → `documents` (with a migration helper).

### 1.2 Polish the first-run experience
- [ ] Empty state on `/reports`: a friendly "drop your first PDF here" panel.
- [ ] Show a clear, in-app banner when `NVIDIA_API_KEY` is missing, with a link to get one.
- [ ] First-run welcome modal that explains the 3 core actions (upload, highlight, read aloud).

### 1.3 Distribution
- [ ] Add `LICENSE` (MIT).
- [ ] Add `CONTRIBUTING.md` with dev setup, code style, PR checklist.
- [ ] Dockerfile + `docker compose up` quick-start.
- [ ] GitHub Actions CI: lint + typecheck + build on PR.
- [ ] Demo GIF/screenshots in the README.

### 1.4 Quality basics
- [ ] Vitest setup with smoke tests for: file extract, DB queries, explain rate-limit logic.
- [ ] Playwright smoke test: upload → view → highlight → save explanation.
- [ ] Basic error boundary on the reports page so a bad doc doesn't break the whole app.

---

## Phase 2 — Make it genuinely useful (next 4–8 weeks of part-time work)

These features compound the value of the existing surface.

### 2.1 LLM provider abstraction
Right now NVIDIA is hardcoded. Move to a single `OPENAI_BASE_URL` + `OPENAI_API_KEY` + `MODEL` env-var trio so users can plug in OpenAI, Groq, Together, OpenRouter, Anthropic-via-proxy, or local Ollama. Ship NVIDIA as the default preset.

### 2.2 Library improvements
- [ ] Full-text search across all documents (SQLite FTS5).
- [ ] Tag autocomplete + bulk tag editor.
- [ ] Reading progress per document (track last-read paragraph).
- [ ] Sort: date added, last opened, title, size.

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
- [ ] Mobile-friendly viewer (current layout assumes desktop).
- [ ] Theme toggle (CRT terminal theme is striking but divisive — offer a clean light theme).
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
- A mobile app (PWA via the mobile-friendly viewer is enough)
- A hosted SaaS — ReadAura is self-host-first; if a hosted version ever happens it'd be a separate project

---

## Open questions

- **Naming the doc model**: keep "report" terminology (familiar to clash-fund roots, but finance-coded), use "document" (generic), or "paper" (academic-coded)? Leaning **document**.
- **Region/collection**: drop entirely in favor of tags, or keep as a first-class concept? Tags are simpler.
- **License**: MIT vs Apache-2.0 vs AGPL? MIT for maximum adoption; AGPL if the long-term plan is a hosted commercial version.
