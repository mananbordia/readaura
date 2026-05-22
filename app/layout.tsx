import type { Metadata, Viewport } from 'next';
import { Inter, Newsreader, VT323 } from 'next/font/google';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-newsreader',
  display: 'swap',
});

const vt323 = VT323({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-vt323',
  display: 'swap',
});

const SITE_URL = 'https://readaura-ai.vercel.app';
const DESCRIPTION =
  'Local-first PDF / DOCX / TXT reader. Highlight any passage for AI explanations, read aloud with neural TTS. Everything stays in your browser.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'ReadAura — a reader that explains itself',
    template: '%s · ReadAura',
  },
  description: DESCRIPTION,
  applicationName: 'ReadAura',
  keywords: [
    'PDF reader',
    'DOCX reader',
    'AI explanations',
    'text to speech',
    'TTS',
    'local first',
    'reading app',
    'highlight explain',
    'study tool',
  ],
  authors: [{ name: 'Manan Bordia' }],
  creator: 'Manan Bordia',
  category: 'productivity',
  openGraph: {
    type: 'website',
    siteName: 'ReadAura',
    title: 'ReadAura — a reader that explains itself',
    description: DESCRIPTION,
    url: SITE_URL,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ReadAura — a reader that explains itself',
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  // `themeColor` is set via viewport export below (Next 14+ convention).
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfaf6' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1b1e' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Inline script avoids a flash of the wrong theme on first paint. Static string.
const themeScript = `(function(){try{var s=localStorage.getItem('readaura-theme');var t=(s==='light'||s==='dark'||s==='crt')?s:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${newsreader.variable} ${vt323.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
