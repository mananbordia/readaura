import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'linear-gradient(135deg, #4f46e5 0%, #312e81 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 24 24"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="3.25" r="0.9" fill="white" />
          <circle cx="12" cy="3.25" r="2.4" fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />
          <path d="M3 7.5h5.5a3.5 3.5 0 0 1 3.5 3.5v10a2.5 2.5 0 0 0-2.5-2.5H3z" fill="white" />
          <path d="M21 7.5h-5.5a3.5 3.5 0 0 0-3.5 3.5v10a2.5 2.5 0 0 1 2.5-2.5H21z" fill="white" />
        </svg>
      </div>
    ),
    size,
  );
}
