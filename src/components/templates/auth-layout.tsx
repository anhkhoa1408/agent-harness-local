import type { ReactNode } from "react";
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center px-6">
      {children}
    </main>
  );
}
