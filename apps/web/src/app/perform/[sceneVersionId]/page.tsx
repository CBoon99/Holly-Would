import { PerformanceStudio } from "@/components/PerformanceStudio";

export default async function PerformPage({
  params,
  searchParams,
}: {
  params: Promise<{ sceneVersionId: string }>;
  searchParams: Promise<{ character?: string }>;
}) {
  const { sceneVersionId } = await params;
  const sp = await searchParams;
  const characterId = sp.character;

  if (!characterId) {
    return (
      <div className="panel p-6 text-stage-mist">
        Missing character. Return to the catalogue and choose a playable role.
      </div>
    );
  }

  return (
    <PerformanceStudio sceneVersionId={sceneVersionId} characterId={characterId} />
  );
}
