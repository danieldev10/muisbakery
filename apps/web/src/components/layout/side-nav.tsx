"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavItem } from "@/lib/navigation";

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="grid gap-1">
      {items.map((item) => {
        if (!item.href) {
          return (
            <span
              className="cursor-default rounded-md px-3 py-2 text-sm font-medium text-stone-400"
              key={item.label}
            >
              {item.label}
            </span>
          );
        }

        const active = isActive(pathname, item.href);

        return (
          <Link
            className={
              active
                ? "rounded-md bg-stone-900 px-3 py-2 text-sm font-medium text-white"
                : "rounded-md px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            }
            href={item.href}
            key={item.label}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
