# ReadAura

Local-first PDF / DOCX / TXT reader with AI-powered explanations on text selection and text-to-speech read-aloud.

Drop a paper, contract, essay, or long-form article into your library. Highlight any passage to get a 2–4 sentence explanation from an LLM — with multi-turn follow-up questions. Hit "Read Aloud" to have it spoken back to you, paragraph by paragraph, with click-to-jump and auto-pause at tables and images.

## Features

- **Library** — Upload PDF or DOCX files (drag-and-drop or file picker), or paste raw text. Tag, filter, edit, and delete from a single page.
- **Viewer** — In-browser PDF embed; DOCX rendered as rich HTML with embedded images; plain TXT supported.
- **Inline editing** — Edit DOCX content directly in the browser, or rewrite pasted-text documents.
- **AI Explain** — Highlight any passage → floating "Explain" button → multi-turn chat with an LLM about the selection.
- **Saved explanations** — Threads persist per document in a sidebar drawer; resume any conversation.
- **Text-to-speech** — High-quality neural voices via Microsoft Edge TTS. Variable speed, paragraph highlighting, click-to-jump, auto-pause at tables and images.

## Quick start

```bash
git clone https://github.com/<you>/readaura.git
cd readaura
npm install
npm run dev
```

Open http://localhost:3000. On first run, click the **Settings** gear in the navbar and paste your NVIDIA NIM API key (free at [build.nvidia.com](https://build.nvidia.com/)). The key is stored in your browser's localStorage — never in a file on disk.

### Docker

```bash
docker compose up --build
```

Library data (SQLite + uploaded files) is stored in a named `readaura_data` volume. Add your API key via the in-app Settings dialog.

## Configuration

Environment variables (optional — set in `.env.local`, or `.env` for Docker Compose):

- `NVIDIA_API_KEY` — server-side fallback for the AI explain feature. The primary flow stores the key in your browser via Settings; set this env var only for shared/headless self-hosted setups where every visitor should share a key.
- `READAURA_DB_PATH` — override for the SQLite database path. Defaults to `./readaura.db`.

## How it works

- **Storage**: SQLite (via `better-sqlite3`) for metadata; uploaded files live under `data/reports/local/`.
- **Auth**: None — single-user local-first. A `local` user row is seeded on first DB init.
- **PDF text**: extracted via `pdf-parse` and cached in the DB.
- **DOCX rendering**: `mammoth` converts to HTML with base64-embedded images.
- **TTS**: `msedge-tts` streams MP3 from Microsoft Edge's voice service. No API key needed.
- **LLM**: NVIDIA NIM hosting `meta/llama-3.3-70b-instruct` via an OpenAI-compatible endpoint. Streams via the Vercel AI SDK. (Pluggable provider is on the [roadmap](ROADMAP.md).)

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · SQLite · Vercel AI SDK · retro CRT CSS, no UI framework.

## Roadmap

See [ROADMAP.md](ROADMAP.md) — what's next, what's on the wishlist, and what's explicitly out of scope.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup, code style, and the PR checklist.

## License

MIT — see [LICENSE](LICENSE).
