"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AuthLayout } from "@/components/templates/auth-layout";
import { FeedbackMessage } from "@/components/molecules/feedback-message";
import { api } from "@/lib/api";
import type { LoginState } from "@/server/codex-login";

export function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState<LoginState | null>(null);
  const [error, setError] = useState("");
  const popup = useRef<Window | null>(null);
  const redirected = useRef(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<LoginState>("codex-auth");
        if (active) setLogin(result);
      } catch {
        if (active)
          setError("Không thể kiểm tra đăng nhập. Thử tải lại trang.");
      }
    };
    void load();
    const timer = setInterval(load, 1500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (
      login?.authorizationUrl &&
      popup.current &&
      !popup.current.closed &&
      !redirected.current
    ) {
      redirected.current = true;
      popup.current.location.href = login.authorizationUrl;
    }
    if (
      login?.status === "authenticated" ||
      login?.status === "error" ||
      login?.status === "unavailable"
    )
      popup.current?.close();
    if (login?.status === "authenticated") router.replace("/");
  }, [login, router]);
  async function start() {
    setBusy(true);
    setError("");
    redirected.current = false;
    popup.current = window.open(
      "about:blank",
      "codex-oauth",
      "width=700,height=800",
    );
    try {
      setLogin(await api<LoginState>("codex-auth", "POST"));
    } catch {
      popup.current?.close();
      setError("Không thể bắt đầu đăng nhập. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }
  const pending = login?.status === "starting" || login?.status === "waiting";
  return (
    <AuthLayout>
      <Button
        size="lg"
        disabled={
          busy ||
          !login ||
          pending ||
          login.status === "authenticated" ||
          login.status === "unavailable"
        }
        onClick={start}
      >
        Đăng nhập với Codex
      </Button>
      <div
        className="absolute top-[calc(50%+36px)] right-6 left-6 mx-auto max-w-md text-center"
        aria-live="polite"
      >
        {!login && !error && <p role="status">Đang kiểm tra đăng nhập…</p>}
        {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
        {login?.error && (
          <FeedbackMessage tone="error">
            {login.error === "login_expired"
              ? "Phiên đăng nhập đã hết thời gian. Vui lòng thử lại."
              : login.error === "codex_unavailable"
                ? "Codex chưa sẵn sàng. Kiểm tra ứng dụng rồi thử lại."
                : "Đăng nhập chưa hoàn tất. Vui lòng thử lại."}
          </FeedbackMessage>
        )}
        {pending && (
          <>
            <p role="status">Hoàn tất đăng nhập trên trang OpenAI.</p>
            {login.authorizationUrl &&
              (!popup.current || popup.current.closed) && (
                <a
                  href={login.authorizationUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Mở trang đăng nhập ↗
                </a>
              )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
