"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { WorkspaceNavigation } from "@/components/organisms/workspace-navigation";
import { PermissionNotifications } from "@/components/organisms/permission-notifications";
export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <WorkspaceNavigation pathname={pathname} />
      <main className="min-w-0 md:ml-56">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-5 py-3 text-xs text-muted-foreground md:px-8">
          Agent workspace
          <PermissionNotifications />
        </header>
        <div className="mx-auto max-w-[1500px] space-y-6 px-5 py-7 md:px-8 md:py-9">
          {children}
        </div>
      </main>
    </>
  );
}
