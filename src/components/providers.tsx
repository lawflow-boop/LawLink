"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "!rounded-md !border !border-border !bg-card !shadow-sm"
        }}
      />
    </SessionProvider>
  );
}
