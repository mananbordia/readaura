# ReadAura

Local-first PDF / DOCX / TXT reader with AI-powered explanations on text selection and text-to-speech read-aloud.

Drop a paper, contract, essay, or long-form article into your library. Highlight any passage to get a 2–4 sentence explanation from an LLM — with multi-turn follow-up questions. Hit "Read Aloud" to have it spoken back, paragraph by paragraph, with click-to-jump and auto-pause at tables and images.

**Everything lives in your browser.** Documents, tags, edits, and saved explanations are stored in IndexedDB — never uploaded to a server, never written to disk. The deployed app is stateless: the only thing the server does is proxy your AI calls and stream TTS audio.

## Features

- **Library** — Upload PDF or DOCX (drag-and-drop or file picker), or paste raw text. Tag, search, sort, bulk-edit, and delete from a single page.
- **Viewer** — PDFs rendered with PDF.js (selectable text layer, original layout preserved). DOCX rendered as rich HTML via mammoth-in-the-browser. TXT served as reader prose.
- **Inline editing** — Edit DOCX content directly in the browser, or rewrite pasted-text documents.
- **AI Explain** — Highlight any passage → floating "Explain" button → multi-turn chat with an LLM about the selection.
- **Saved explanations** — Threads persist per document in a sidebar drawer; resume any conversation.
- **Text-to-speech** — High-quality neural voices via Microsoft Edge TTS (no API key). Variable speed, paragraph highlighting, click-to-jump.
- **Three themes** — Light, dark, and a retro CRT mode.

## Quick start

```bash
git clone https://github.com/<you>/readaura.git
cd readaura
npm install
npm run dev
```

Open http://localhost:3000. On first run, click the **Settings** gear in the navbar and paste your NVIDIA NIM API key (free at [build.nvidia.com](https://build.nvidia.com/)). The key is stored in your browser's localStorage.

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<you>/readaura)

No environment variables needed for the default flow — every visitor supplies their own NVIDIA key via the in-app Settings dialog. If you want a shared key for every visitor (kiosk-style deployments), set `NVIDIA_API_KEY` in your Vercel project settings.

### Docker

```bash
docker compose up --build
```

The container is stateless — no volume mounts required. Each user's library lives in their own browser.

## Configuration

Environment variables (all optional):

- `NVIDIA_API_KEY` — server-side fallback. The default flow stores the key in your browser via Settings; set this only for shared/headless deployments where every visitor should share a key.

## How it works

- **Storage** — IndexedDB stores documents (metadata + file blob), HTML overrides for edited DOCX, and saved explanation threads. No SQLite, no filesystem.
- **PDF rendering** — `react-pdf` with PDF.js, dynamically imported so it stays out of the server bundle. Selection in the text layer triggers the in-app Explain flow.
- **DOCX rendering** — `mammoth` runs in the browser to convert DOCX → HTML with embedded base64 images.
- **TTS** — `msedge-tts` streams MP3 from Microsoft Edge's voice service. The only thing this needs the server for is the WebSocket connection to Microsoft.
- **LLM** — NVIDIA NIM (`meta/llama-3.3-70b-instruct`) via an OpenAI-compatible endpoint. The server route is a thin streaming proxy that injects your API key and rate-limits per IP.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · IndexedDB (via `idb`) · Vercel AI SDK · shadcn-style component layer (Radix + cva).

## Roadmap

See [ROADMAP.md](ROADMAP.md).

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup and the PR checklist.

## License

MIT — see [LICENSE](LICENSE).
