import "@fontsource-variable/geist/index.css";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { queryClient } from "./lib/query-client";
import { routeTree } from "./routes/router";
import { Toaster } from "sonner";
import { ThemeProvider } from "./components/theme-provider";
import { ROUTER_BASEPATH } from "./config/constants";

const router = createRouter({ routeTree, basepath: ROUTER_BASEPATH });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
      <Toaster />
    </ThemeProvider>
  </StrictMode>,
);
