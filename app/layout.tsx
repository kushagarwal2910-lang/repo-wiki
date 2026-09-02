import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Anima — Visual Intelligence',
  description: 'Turn trusted knowledge into interactive, narrated visual lessons.',
  openGraph: {
    title: 'Anima — Visual Intelligence',
    description: 'Knowledge, made visible.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Anima — Knowledge, made visible.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anima — Visual Intelligence',
    description: 'Knowledge, made visible.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
