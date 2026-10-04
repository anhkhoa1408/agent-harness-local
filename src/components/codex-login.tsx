"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "./api";
import type { LoginState } from "../server/codex-login";

export function CodexLoginPage() {
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
  }, [login]);
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
    <section className="panel">
      <h1>Đăng nhập Codex</h1>
      <p className="muted">
        Dùng tài khoản ChatGPT để kết nối Codex. Phiên đăng nhập được lưu cho
        các lần chạy sau.
      </p>
      {!login && !error && <p>Đang kiểm tra đăng nhập…</p>}
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      {login?.status === "authenticated" ? (
        <>
          <p role="status" className="notice">
            Đã đăng nhập Codex.
          </p>
          <Link href="/settings">Chọn model →</Link>
        </>
      ) : (
        <>
          {login?.error && (
            <p role="alert" className="alert">
              {login.error === "login_expired"
                ? "Phiên đăng nhập đã hết thời gian. Vui lòng thử lại."
                : login.error === "codex_unavailable"
                  ? "Codex chưa sẵn sàng. Kiểm tra ứng dụng rồi thử lại."
                  : "Đăng nhập chưa hoàn tất. Vui lòng thử lại."}
            </p>
          )}
          {pending ? (
            <>
              <p role="status">
                Hoàn tất đăng nhập trên trang OpenAI rồi quay lại đây.
              </p>
              {login.authorizationUrl && (
                <p>
                  <a
                    href={login.authorizationUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Mở trang đăng nhập OpenAI ↗
                  </a>
                </p>
              )}
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    setLogin(
                      await api<LoginState>("codex-auth/cancel", "POST"),
                    );
                    popup.current?.close();
                  } catch {
                    setError("Không thể hủy đăng nhập. Vui lòng thử lại.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Hủy đăng nhập
              </button>
            </>
          ) : (
            <button
              className="primary"
              disabled={busy || !login || login.status === "unavailable"}
              onClick={start}
            >
              Đăng nhập với OpenAI
            </button>
          )}
        </>
      )}
    </section>
  );
}
