import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '재무제표 대시보드',
  description: '손익계산서, 재무상태표, 현금흐름표 대시보드',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}

