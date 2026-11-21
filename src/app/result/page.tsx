import { Results } from '@/components/namae';
import type { Metadata } from 'next';
export const metadata: Metadata = { robots: { index: false, follow: true } };
export default function Page() { return <Results/>; }
