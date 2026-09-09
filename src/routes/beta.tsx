import { createFileRoute } from "@tanstack/react-router";
import { saveBetaBrief } from "@/lib/beta-api";
import { BETA_QUESTIONS } from "@/lib/beta-brief";
import { BriefFlow } from "@/components/brief-flow";

export const Route = createFileRoute("/beta")({
  component: BetaBrief,
});

function BetaBrief() {
  return (
    <BriefFlow
      kicker="Beta"
      questions={BETA_QUESTIONS}
      storageKey="cifra-beta-brief"
      doneKey="cifra-beta-brief-done"
      save={(answers) => saveBetaBrief({ data: { answers } }).then(() => undefined)}
      doneBody={'Ya tengo tus respuestas. En el chat escribí “listo” y armo el corte de la beta con eso.'}
    />
  );
}
