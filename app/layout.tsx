import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Fieldnote | Audio collection',
  description:
    'Record, review and deliver carefully checked audio transcripts.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
