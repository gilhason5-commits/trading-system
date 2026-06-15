import { getRepository } from "@trading/core";
import { SourceManager } from "@/components/SourceManager";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const repo = getRepository();
  const sources = await repo.listSources();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ניהול מקורות</h1>
      <p className="text-sm text-[var(--muted)]">
        מקורות פעילים נסרקים בריצה היומית לזיהוי סיגנלים וטיקרים.
      </p>
      <SourceManager sources={sources} />
    </div>
  );
}
