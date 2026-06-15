import { getRepository } from "@trading/core";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const repo = getRepository();
  const settings = await repo.getSettings();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>
      <p className="text-sm text-[var(--muted)]">
        הגדרות הפעלת הסוכן היומי — שעת הסיכום, סף ריכוזיות, ודוא&quot;ל לדיווח.
      </p>
      <SettingsForm settings={settings} />
    </div>
  );
}
