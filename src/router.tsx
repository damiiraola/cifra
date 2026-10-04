import { createRouter } from "@tanstack/react-router";
import { AppErrorComponent } from "@/lib/error-component";
import { routeTree } from "./routeTree.gen";
import { reportClientError } from "@/lib/observability.browser";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    // Errors caught by a route's error screen also go to Sentry (if set up).
    defaultOnCatch: (error) => reportClientError(error, { where: "route" }),
  });
}
