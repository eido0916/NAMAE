import type { Metadata } from 'next';
import { DiagnosisProvider, Header, Footer } from '@/components/namae';
import './globals.css';
const title='NAMAE｜もし海外で生まれていたらあなたは何という名前？';
const description='日本での名前や苗字ランキングをもとに、日本と同じ順位の海外の名前へ変換する診断サービス。日本と海外5か国の公開データに対応。';
export const metadata: Metadata = {metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),title,description,openGraph:{title,description,type:'website',locale:'ja_JP',siteName:'NAMAE'},twitter:{card:'summary_large_image',title,description}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="ja"><body><DiagnosisProvider><div className="site-shell"><Header/>{children}<Footer/></div></DiagnosisProvider></body></html>;}
