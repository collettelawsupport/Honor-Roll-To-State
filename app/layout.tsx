import type { Metadata } from 'next';
import './globals.css';

const productionSiteUrl = 'https://honorrollregistration.texasourlittlemiss.net';
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  || (process.env.NODE_ENV === 'production' ? productionSiteUrl : 'http://localhost:3000');
const title = '2026 Honor Roll State Registration — Texas Our Little Miss';
const description = 'Honor Roll and Winner’s Circle registration for the 2026 Texas Our Little Miss State Universal Beauty Competition.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  openGraph: {
    title,
    description,
    url: '/',
    type: 'website',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: '2026 Honor Roll State Registration — Texas Our Little Miss' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
