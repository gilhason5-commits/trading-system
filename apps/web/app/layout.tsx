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
            <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <span className="text-lg font-bold">מערכת מסחר אישית</span>
              <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--muted)]">
                {nav.map((n) => (
                  <a key={n.href} href={n.href} className="hover:text-[var(--text)]">
                    {n.label}
                  </a>
                ))}
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
