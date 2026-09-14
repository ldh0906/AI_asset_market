import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'AI 에셋마켓', description: '시험 결과와 판매 조건을 확인하고 구매하는 Skill·문서 마켓' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
