// app/Nav.tsx
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

export default function Nav() {
  const path = usePathname();
  const links = [
    { href: "/", label: "Submit" },
    { href: "/eval", label: "Test Suite" },
    { href: "/generate", label: "Doc Generator" },
    { href: "/admin", label: "Policy" },
  ];
  return (
    <div className="topbar">
      <div className="wrap topbar-inner">
        <Link href="/" className="brand">
          <span className="mark">✚</span>
          <span>
            Plum OPD
            <small>Claim Adjudicator</small>
          </span>
        </Link>
        <nav className="nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={path === l.href ? "active" : ""}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
