"use client";

import { useEffect, useRef } from "react";

// Embeds TradingView's free Advanced Chart, pre-loaded with the indicators we
// cite in the analysis: SMA50, SMA200, RSI and MACD. Used in the recommendation
// modal for the day's top picks.

declare global {
  interface Window {
    TradingView?: { widget: new (config: Record<string, unknown>) => unknown };
  }
}

let tvScript: Promise<void> | null = null;
function loadTradingView(): Promise<void> {
  if (typeof window !== "undefined" && window.TradingView) return Promise.resolve();
  if (!tvScript) {
    tvScript = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("tv.js failed"));
      document.head.appendChild(s);
    });
  }
  return tvScript;
}

export function TradingViewChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    loadTradingView()
      .then(() => {
        if (cancelled || !window.TradingView || !ref.current) return;
        ref.current.id = idRef.current;
        ref.current.innerHTML = "";
        new window.TradingView.widget({
          symbol,
          interval: "D",
          container_id: idRef.current,
          width: "100%",
          height: 380,
          theme: "dark",
          style: "1",
          locale: "he",
          timezone: "Asia/Jerusalem",
          hide_side_toolbar: true,
          allow_symbol_change: false,
          studies: [
            { id: "MASimple@tv-basicstudies", inputs: { length: 50 } },
            { id: "MASimple@tv-basicstudies", inputs: { length: 200 } },
            "RSI@tv-basicstudies",
            "MACD@tv-basicstudies",
          ],
        });
      })
      .catch(() => {
        if (ref.current) ref.current.innerHTML = "";
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  return (
    <div className="overflow-hidden rounded-md border border-[var(--border)]">
      <div ref={ref} className="h-[380px] w-full" />
    </div>
  );
}
