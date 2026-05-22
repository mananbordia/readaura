import { ImageResponse } from 'next/og';

export const alt = 'ReadAura — local-first reader with AI explanations and read-aloud';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4f46e5 100%)',
          color: 'white',
          padding: '80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        {/* Top row — mark + wordmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 88,
              height: 88,
              background: 'rgba(255,255,255,0.12)',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="56" height="56" viewBox="0 0 24 24">
              <circle cx="12" cy="3.25" r="0.9" fill="white" />
              <circle cx="12" cy="3.25" r="2.4" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />
              <path d="M3 7.5h5.5a3.5 3.5 0 0 1 3.5 3.5v10a2.5 2.5 0 0 0-2.5-2.5H3z" fill="white" />
              <path d="M21 7.5h-5.5a3.5 3.5 0 0 0-3.5 3.5v10a2.5 2.5 0 0 1 2.5-2.5H21z" fill="white" />
            </svg>
          </div>
          <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: '-0.02em' }}>
            ReadAura
          </div>
        </div>

        {/* Headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: '-0.025em',
              maxWidth: 920,
            }}
          >
            A reader that explains itself.
          </div>
          <div style={{ fontSize: 32, opacity: 0.78, maxWidth: 900, lineHeight: 1.35 }}>
            Local-first PDF / DOCX / TXT reader. Highlight any passage for AI
            explanations. High-quality TTS read-aloud. Everything stays in your
            browser.
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 24,
            opacity: 0.7,
          }}
        >
          <span>readaura-ai.vercel.app</span>
          <span>Open source · MIT</span>
        </div>
      </div>
    ),
    size,
  );
}
