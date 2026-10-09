"use client";
import { useEffect, useState, type ReactNode } from "react";
import { WorkspaceLayout } from "@/components/templates/workspace-layout";
import { AuthLayout } from "@/components/templates/auth-layout";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { LoginState } from "@/server/codex-login";

export function WorkspaceAccess({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [verifiedPath, setVerifiedPath] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    path: string;
    message: string;
  } | null>(null);
  const error = failure?.path === pathname ? failure.message : "";
  useEffect(() => {
    if (pathname === "/login") return;
    let active = true;
    void api<LoginState>("codex-auth")
      .then((login) => {
        if (!active) return;
        setFailure(null);
        if (login.status === "authenticated") setVerifiedPath(pathname);
        else router.replace("/login");
      })
      .catch(() => {
        if (active)
          setFailure({
            path: pathname,
            message: "Không thể kiểm tra đăng nhập. Thử tải lại trang.",
          });
      });
    return () => {
      active = false;
    };
  }, [pathname, router]);
  if (pathname === "/login") return children;
  if (verifiedPath !== pathname)
    return (
      <AuthLayout>
        <div className="max-w-md">
          <FeedbackMessage tone={error ? "error" : "info"}>
            {error || "Đang kiểm tra đăng nhập…"}
          </FeedbackMessage>
        </div>
      </AuthLayout>
    );
  return <WorkspaceLayout>{children}</WorkspaceLayout>;
}
