import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { Nav } from "../components/Nav.tsx";
import { addressUrl, shortHex } from "../shared/explorer.ts";

import "./globals.css";

export const metadata: Metadata = {
  title: "Proof of Alpha",
  description:
    "A notary for crypto KOL calls: every call priced against what the market already expected, locked on BNB Chain before the outcome is known.",
};

/** The registry address is public; it is read on the server so the badge always names the deployed contract. */
function registry(): string | null {
  const a = process.env["CALL_REGISTRY_TESTNET"]?.trim();
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? a : null;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const reg = registry();
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
        />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </span>
              Proof of Alpha
            </Link>
            <Nav />
            {reg ? (
              <a className="chain-badge" href={addressUrl(97, reg)} target="_blank" rel="noreferrer" title="CallRegistry on BSC testnet">
                <span className="dot" aria-hidden="true" />
                {shortHex(reg, 6, 3)} · Testnet
              </a>
            ) : (
              <span className="chain-badge" style={{ borderColor: "var(--line-2)", color: "var(--text-2)" }}>
                BSC Testnet · no registry
              </span>
            )}
          </div>
        </header>
        <div className="shell">
          {children}
          <footer className="footer">
            <span>Proof of Alpha · BNB Bangkok 2026</span>
            <Link href="/method">How it works</Link>
            {reg ? (
              <a href={addressUrl(97, reg)} target="_blank" rel="noreferrer">
                CallRegistry {shortHex(reg)}
              </a>
            ) : null}
          </footer>
        </div>
      </body>
    </html>
  );
}
