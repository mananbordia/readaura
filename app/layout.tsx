import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ReadAura',
  description: 'Local-first PDF/DOCX reader with AI explain-on-selection and TTS read-aloud.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
