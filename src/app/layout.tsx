import type { ReactNode } from "react";
import { WorkspaceAccess } from "@/components/pages/workspace-access";
import "./globals.css";
export const metadata = {
  title: "Agent Harness — Local workspace",
  description: "Điều phối coding agents theo plan, evidence và review.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <WorkspaceAccess>{children}</WorkspaceAccess>
      </body>
    </html>
  );
}
