import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/beta")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
