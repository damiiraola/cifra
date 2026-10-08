import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/fijos")({
  beforeLoad: () => {
    throw redirect({ to: "/ajustes", hash: "fijos" });
  },
});
