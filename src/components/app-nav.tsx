"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/home", label: "Home" },
  { href: "/vocab", label: "Vocab" },
  { href: "/activities", label: "Activities" },
  { href: "/missions", label: "Missions" },
];

export default function AppNav() {
  const pathname = usePathname();

  return (
    // Bottom tab bar on phones (thumb-reachable, stays put while scrolling),
    // an inline row inside the header on wider screens.
    <nav
      className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-gray-200 bg-white
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
            className={`px-3 py-3 text-center text-sm md:rounded-md md:py-1.5 ${
              active
                ? "font-medium text-black md:bg-gray-100"
                : "text-gray-500 hover:text-black md:hover:bg-gray-100"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
