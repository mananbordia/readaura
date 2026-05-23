# ReadAura

A local-first PDF / DOCX / TXT reader with AI explanations on selection and neural-voice text-to-speech.

**Live demo:** [readaura-ai.vercel.app](https://readaura-ai.vercel.app)

<video src="https://readaura-ai.vercel.app/demo/product_demo.webm" width="100%" controls autoplay loop muted playsinline></video>

Drop a paper, contract, essay, or long-form article into your library. Highlight any passage to get a 2–4 sentence explanation from an LLM — with multi-turn follow-up questions. Hit "Read Aloud" to have it spoken back, paragraph by paragraph, with click-to-jump and auto-pause at tables and images.

**Everything lives in your browser.** Documents, tags, edits, and saved explanations are stored in IndexedDB. Nothing is uploaded to a server, nothing is written to disk. The hosted instance is stateless: the only thing the server does is proxy your AI calls and stream TTS audio.

## Features

- **Library** — Upload PDF / DOCX (drag-and-drop or file picker), or paste raw text. Tag, search, sort, bulk-edit, delete.
- **Viewer** — PDFs render via PDF.js with a selectable text layer (original layout preserved). DOCX renders as rich HTML via mammoth-in-the-browser. TXT served as reader prose.
- **Inline editing** — Edit DOCX content directly in the browser, or rewrite pasted-text documents.
- **AI Explain** — Highlight any passage → floating "Explain" button → multi-turn chat about the selection. Threads save to a per-document drawer; resume anytime.
- **Text-to-speech** — High-quality Microsoft Edge neural voices. Variable speed, paragraph highlighting, click-to-jump, auto-pause at tables and images. No API key needed.
- **Three themes** — Light, dark, and a retro CRT mode.
- **Bring your own AI key** — Paste a free NVIDIA NIM key into the in-app Settings dialog; it's stored in your browser's localStorage, never on the server.

## Quick start

```bash
git clone https://github.com/<you>/readaura.git
cd readaura
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first run, click the **Settings** gear in the navbar and paste your NVIDIA NIM key (free at [build.nvidia.com](https://build.nvidia.com/)).

## Deploy

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<you>/readaura)

Zero env vars needed for the default flow — every visitor supplies their own NVIDIA key in Settings. Set `NVIDIA_API_KEY` in your Vercel project only if you want a shared kiosk-style key.

### Docker

```bash
docker compose up --build
```

The container is stateless — no volume mounts required.

## Configuration

All env vars are optional:

| Variable | Effect |
| --- | --- |
| `NVIDIA_API_KEY` | Server-side fallback for the AI Explain feature. Default flow stores the key in the visitor's browser; only set this for shared / headless deployments. |

## How it works

- **Storage** — IndexedDB (via [`idb`](https://github.com/jakearchibald/idb)) stores document metadata, file blobs, edited DOCX HTML, and saved explanation threads. No SQLite, no filesystem.
- **PDF rendering** — `react-pdf` with PDF.js, dynamically imported so it stays out of the server bundle. Selection in the text layer triggers the in-app Explain flow.
- **DOCX rendering** — `mammoth` runs in the browser to convert DOCX → HTML with embedded base64 images.
- **TTS** — `msedge-tts` streams MP3 from Microsoft Edge's voice service. The server route is a thin pass-through.
- **LLM** — NVIDIA NIM (`meta/llama-3.3-70b-instruct`) via an OpenAI-compatible endpoint. The server route is a streaming proxy that injects the user-supplied API key and rate-limits per IP.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · IndexedDB · Vercel AI SDK · shadcn-style component layer (Radix + cva).

## Roadmap

See [ROADMAP.md](ROADMAP.md) — what's planned, what's done, what's explicitly out of scope.

## Contributing

PRs welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup and the PR checklist.

## License

MIT — see [LICENSE](LICENSE).
