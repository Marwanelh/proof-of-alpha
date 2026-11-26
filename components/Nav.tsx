"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/leaderboard", label: "Leaderboard", match: (p: string) => p.startsWith("/leaderboard") },
  { href: "/", label: "Verify a call", match: (p: string) => p === "/" },
  { href: "/kol", label: "KOL profile", match: (p: string) => p.startsWith("/kol") },
];

export function Nav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="nav" aria-label="Primary">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
