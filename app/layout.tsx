import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DKB Protocol',
  description: '分散型自律メディア / 中抜き完全排除型評価プロトコル',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-black text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}