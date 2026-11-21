import type { Metadata } from 'next';
import { DiagnosisProvider, Header, Footer } from '@/components/namae';
import './globals.css';
import countries from '@/data/countries.json';
const title='NAMAE｜もし海外で生まれていたらあなたは何という名前？';
const countryCount = countries.filter(country => country.enabled).length;
const description=`国・地域を選んで、現地の文字で名前や苗字を入力。${countryCount}の国・地域の名前データを使って世界の名前を探せます。順位の対象・年度・出典も確認できます。`;
export const metadata: Metadata = {metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),title,description,openGraph:{title,description,type:'website',locale:'ja_JP',siteName:'NAMAE'},twitter:{card:'summary_large_image',title,description}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {return <html lang="ja"><body><DiagnosisProvider><div className="site-shell"><Header/>{children}<Footer/></div></DiagnosisProvider></body></html>;}
