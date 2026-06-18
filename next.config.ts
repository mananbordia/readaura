import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'pdf-parse', 'msedge-tts'],
  // Inline the club flag as a literal ('true'/'false') so `CLUB_BUILD` is a
  // compile-time constant even when the var is UNSET (the flag-off / CI build).
  // Next doesn't inline an unset NEXT_PUBLIC_ var, so without this the club
  // import() chunks aren't dead-code-eliminated and leak /api/club into the
  // bundle, tripping the flag-off parity gate.
  env: {
    NEXT_PUBLIC_CLUB_ENABLED: process.env.NEXT_PUBLIC_CLUB_ENABLED === 'true' ? 'true' : 'false',
  },
};

export default nextConfig;
