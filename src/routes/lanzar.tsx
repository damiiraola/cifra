import { createFileRoute } from "@tanstack/react-router";
import { saveLaunchBrief } from "@/lib/beta-api";
import { formatLaunchCode, LAUNCH_QUESTIONS } from "@/lib/launch-brief";
import { BriefFlow } from "@/components/brief-flow";

export const Route = createFileRoute("/lanzar")({
  component: LanzarBrief,
});

function LanzarBrief() {
  return (
    <BriefFlow
      kicker="Lanzar"
      questions={LAUNCH_QUESTIONS}
      storageKey="cifra-launch-brief"
      doneKey="cifra-launch-brief-done"
      save={(answers) => saveLaunchBrief({ data: { answers } }).then(() => undefined)}
      copyText={formatLaunchCode}
      doneBody="Tocá el código, pegalo en el chat y arrancamos el corte de la beta."
    />
  );
}
