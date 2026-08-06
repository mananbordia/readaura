// Flag-off parity gate (invariant #5: club off == today's experience).
//
// After `next build` WITHOUT NEXT_PUBLIC_CLUB_ENABLED (the default / Vercel-demo
// build), no club code may be EAGERLY loaded by the app. We scan the built
// client chunks for a string marker that appears only in club client code and
// survives minification: data-club.
//
// Club UI is a next/dynamic import gated behind the build flag, so when the flag
// is off the club chunk is registered in react-loadable-manifest.json but is
// NEVER fetched (the dynamic component resolves to null and never mounts). Such
// flag-gated lazy chunks are allowed; a marker in any EAGERLY-loaded chunk fails.

import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const NEXT = '.next';
const STATIC = join(NEXT, 'static');
const FORBIDDEN = ['data-club'];

async function walk(dir, match) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, match)));
    else if (match(e.name, p)) out.push(p);
  }
  return out;
}

// Basenames of every chunk loaded on-demand via next/dynamic (across all routes).
async function collectLazyChunks() {
  const manifests = await walk(NEXT, (name) => name === 'react-loadable-manifest.json');
  const lazy = new Set();
  for (const m of manifests) {
    try {
      const json = JSON.parse(await readFile(m, 'utf8'));
      for (const entry of Object.values(json)) {
        for (const f of entry?.files ?? []) lazy.add(basename(f));
      }
    } catch {
      /* ignore unparseable manifest */
    }
  }
  return lazy;
}

const lazy = await collectLazyChunks();
const files = await walk(STATIC, (name) => name.endsWith('.js'));
if (files.length === 0) {
  console.error(`parity check: no client JS under ${STATIC}. Run \`next build\` first.`);
  process.exit(1);
}

const eagerHits = [];
const lazyClubChunks = new Set();
for (const f of files) {
  const src = await readFile(f, 'utf8');
  const hit = FORBIDDEN.find((m) => src.includes(m));
  if (!hit) continue;
  if (lazy.has(basename(f))) lazyClubChunks.add(basename(f));
  else eagerHits.push(`  ${hit}  in  ${f}`);
}

if (eagerHits.length > 0) {
  console.error('flag-off parity FAILED — club markers found in eagerly-loaded chunks:');
  console.error(eagerHits.join('\n'));
  console.error('\nClub code must stay behind the NEXT_PUBLIC_CLUB_ENABLED-gated next/dynamic import.');
  process.exit(1);
}

console.log(
  `flag-off parity OK — scanned ${files.length} client chunk(s); no club markers in any eagerly-loaded chunk` +
    (lazyClubChunks.size
      ? ` (${lazyClubChunks.size} flag-gated lazy club chunk present but never fetched when off).`
      : '.'),
);
