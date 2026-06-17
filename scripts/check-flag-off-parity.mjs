// Flag-off parity gate (invariant #5: club off == byte-for-byte today).
//
// After `next build` WITHOUT NEXT_PUBLIC_CLUB_ENABLED (the default / Vercel-demo
// build), the client bundle must contain no club code. We scan the built client
// chunks for string literals that only ever appear in club client code and that
// survive minification (identifiers get mangled; these strings don't).
//
// Phase 1 has no club UI yet, so this passes trivially and locks the baseline.
// From Phase 2 on, if club UI is imported statically instead of dynamic-gated
// behind the flag, these markers leak into the bundle and CI fails here.

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const STATIC_DIR = '.next/static';
const FORBIDDEN = ['data-club', '/api/club', 'x-club-proxy-secret'];

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = await walk(STATIC_DIR);
if (files.length === 0) {
  console.error(`parity check: no client JS under ${STATIC_DIR}. Run \`next build\` first.`);
  process.exit(1);
}

const hits = [];
for (const f of files) {
  const src = await readFile(f, 'utf8');
  for (const marker of FORBIDDEN) {
    if (src.includes(marker)) hits.push(`  ${marker}  in  ${f}`);
  }
}

if (hits.length > 0) {
  console.error('flag-off parity FAILED — club code leaked into the client bundle:');
  console.error(hits.join('\n'));
  console.error(
    '\nClub UI must be dynamic-imported behind NEXT_PUBLIC_CLUB_ENABLED so it is\n' +
      'excluded from the bundle when the flag is off.',
  );
  process.exit(1);
}

console.log(`flag-off parity OK — scanned ${files.length} client chunk(s); no club markers present.`);
