import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
export const metadata = {
  title: "Agent Harness — Local workspace",
  description: "Điều phối coding agents theo plan, evidence và review.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <aside className="sidebar">
          <Link href="/" className="brand">
            <span className="mark">H</span> Harness <small>LOCAL</small>
          </Link>
          <p className="nav-label">WORKSPACE</p>
          <nav>
            <Link href="/">◫ &nbsp; Tổng quan</Link>
            <Link href="/settings">⚙ &nbsp; Model & skills</Link>
          </nav>
        </aside>
        <main>
          <header className="topbar">
            <span>Agent workspace</span>
          </header>
          <div className="content">{children}</div>
        </main>
      </body>
    </html>
  );
}
