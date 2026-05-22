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

The app boots at http://localhost:3000. SQLite (`readaura.db`) and uploaded files (`data/reports/local/`) are created on first run and ignored by git.

## Project layout

```
app/                  Next.js App Router pages and API routes
  api/library/        Server routes (uploads, AI explain, TTS, etc.)
  library/            The Library UI
components/           Shared React components (Navbar, theme, shadcn-style ui/)
lib/                  Server-only helpers — DB, text extraction, auth shim
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
- [ ] If you changed the DB schema, added a migration step in `lib/db.ts` so existing users don't lose data
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
