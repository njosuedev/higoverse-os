"use client";

import { useEffect, useState } from "react";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isOffline, subscribeConnection } from "./connection";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // Created inside the component (not module scope) so each request gets its
  // own cache under App Router SSR — a module-level client would leak data
  // across users/requests on the server.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // Queries pause while Higoverse can't be reached (not only when the browser
  // says it's offline) and load again by themselves when it's back.
  useEffect(() => onlineManager.setEventListener((setOnline) => {
    setOnline(!isOffline());
    return subscribeConnection(() => setOnline(!isOffline()));
  }), []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
