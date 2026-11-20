import type { Metadata, Viewport } from 'next';
import './globals.css';
import ghostMark from '../../brand/me/brand/mark.svg';

export const metadata: Metadata = {
  title: 'Vehicle Signal Workbench',
  description: 'A focused workspace for comparing vehicle measurement runs.',
  icons: {
    icon: ghostMark.src,
    shortcut: ghostMark.src,
    apple: ghostMark.src,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
