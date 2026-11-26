import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Proof of Alpha",
  description:
    "A credit record for crypto KOLs: every call priced against what the market already expected, locked on BNB Chain before the outcome is known.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="masthead">
            <Link href="/" className="wordmark"><span className="brand-mark" aria-hidden="true">α</span>Proof of Alpha</Link>
            <nav aria-label="Primary">
              <Link href="/">Score a call</Link>
              <Link href="/leaderboard">Leaderboard</Link>
              <Link href="/method">Method</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
