import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "מערכת מסחר אישית",
  description: "ניטור תיק, ניתוח יומי, סקרייפינג וסיכום — read-only",
};

const nav = [
  { href: "/", label: "דשבורד" },
  { href: "/paper", label: "תיק דמה" },
  { href: "/leads", label: "לידים והמלצות" },
  { href: "/digests", label: "סיכומים יומיים" },
  { href: "/sources", label: "מקורות" },
  { href: "/settings", label: "הגדרות" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-[var(--border)] bg-[var(--surface)]">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <span className="text-lg font-bold">מערכת מסחר אישית</span>
              <nav className="flex gap-5 text-sm text-[var(--muted)]">
                {nav.map((n) => (
                  <a key={n.href} href={n.href} className="hover:text-[var(--text)]">
                    {n.label}
                  </a>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
