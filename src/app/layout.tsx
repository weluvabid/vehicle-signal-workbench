import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vehicle Signal Workbench',
  description: 'A focused workspace for comparing vehicle measurement runs.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
