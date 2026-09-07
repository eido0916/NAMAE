"use client";

import { useEffect } from "react";
import { reportOperationalError } from "@/lib/monitoring";

export default function GlobalError({ reset }: { reset: () => void }) {
  useEffect(() => {
    reportOperationalError("render_failed");
  }, []);
  return (
    <html lang="ja">
      <body>
        <main className="empty glass">
          <span className="eyebrow">TEMPORARY ERROR</span>
          <h1>画面を表示できませんでした。</h1>
          <p>通信状況をご確認のうえ、もう一度お試しください。</p>
          <button className="primary" onClick={reset}>
            再読み込み ↻
          </button>
        </main>
      </body>
    </html>
  );
}
