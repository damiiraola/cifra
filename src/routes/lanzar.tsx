import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/lanzar")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
