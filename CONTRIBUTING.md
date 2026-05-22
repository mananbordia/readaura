# Contributing to ReadAura

Thanks for considering a contribution! ReadAura is a small, local-first reading tool. Issues and pull requests are welcome.

## Dev setup

Prereqs: Node 20+ and npm.

```bash
git clone https://github.com/<you>/readaura.git
cd readaura
npm install
cp .env.example .env.local
# Add NVIDIA_API_KEY to .env.local (free at https://build.nvidia.com/)
npm run dev
```

The app boots at http://localhost:3000. The library lives entirely in your browser's IndexedDB — nothing is written to disk, so there's no database file to wipe and no `data/` directory to manage.

## Project layout

```
app/
  api/ai/explain/     Streaming NVIDIA proxy (the only AI route)
  api/tts/            msedge-tts proxy
  library/            The Library UI (LibraryClient is the heart)
components/           Shared React components — Navbar, theme, shadcn-style ui/
  ui/                 shadcn-style primitives (Radix + cva)
lib/
  storage.ts          IndexedDB wrapper (everything user-facing lives here)
  types.ts            Document / SavedExplanation shape
  pdf-text.ts         Browser-side PDF text extraction via pdfjs-dist
  docx-html.ts        Browser-side DOCX → HTML via mammoth
  use-api-key.ts      Hook for the NVIDIA key in localStorage
ROADMAP.md            What's planned and why
```

## Code style

- TypeScript everywhere. Run `npx tsc --noEmit` before pushing.
- `npm run lint` for ESLint (Next defaults).
- Keep server-only modules (anything importing `fs`, `better-sqlite3`, etc.) out of `'use client'` files.
- Don't introduce a UI framework or component library — the retro CRT styling is intentional.

## Pull request checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds
- [ ] Manually tested the affected flow (upload, view, highlight + explain, read aloud)
- [ ] If you changed the IndexedDB schema in `lib/storage.ts`, bumped `DB_VERSION` and added an `upgrade` branch so existing browsers migrate without data loss
- [ ] No new secrets, credentials, or large binaries committed

## Filing issues

- **Bug**: include OS, Node version, the document type (PDF/DOCX/TXT), and a reproducible series of steps. If the AI explain feature is involved, note which provider/model.
- **Feature**: check [ROADMAP.md](ROADMAP.md) first — it may already be planned. If not, describe the use case before the implementation.

## What's in scope

- Anything in [ROADMAP.md](ROADMAP.md) Phase 1 or Phase 2 is fair game.
- Phase 3 items are big enough to deserve a design discussion in an issue first.
- Non-goals (also in the roadmap): hosted SaaS, real-time collab, a native mobile app.

## License

By contributing, you agree your contributions are licensed under the MIT License (see [LICENSE](LICENSE)).
