import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/movimientos")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});