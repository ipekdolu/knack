"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/vocab", label: "Vocabulary" },
  { href: "/activities", label: "Activities" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    // Bottom tab bar on phones (thumb-reachable, stays put while scrolling),
    // an inline row inside the header on wider screens.
    <nav
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 border-t-[2.5px] border-text bg-primary
                 md:static md:z-auto md:flex md:gap-1 md:border-t-0 md:bg-transparent"
    >
      {ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-3 text-center text-sm font-bold rounded-pill whitespace-nowrap md:px-2.5 md:py-1 md:text-xs ${
              active
                ? "bg-text text-primary"
                : "text-primary-ink/70 hover:text-primary-ink md:hover:bg-black/5"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
