"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { getApiBaseUrl } from "@/lib/api";

type NotificationItem = {
  id: string;
  label: string;
  detail: string;
  meta: string;
  href: string;
};

type NotificationsResponse = {
  count: number;
  items: NotificationItem[];
};

const REFRESH_INTERVAL_MS = 60_000;

export function NotificationsBell({
  initialNotifications,
}: {
  initialNotifications: NotificationsResponse;
}) {
  const [notifications, setNotifications] =
    useState<NotificationsResponse>(initialNotifications);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/dashboard/notifications`,
        { credentials: "include", cache: "no-store" },
      );

      if (response.ok) {
        setNotifications((await response.json()) as NotificationsResponse);
      }
    } catch {
      // Keep the last known count when the API is briefly unreachable.
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    const handleFocus = () => void load();

    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-label={
          notifications.count > 0
            ? `Notifications: ${notifications.count} actions required`
            : "Notifications"
        }
        className="relative inline-flex size-9 items-center justify-center rounded-md border border-[color:var(--border-strong)] bg-white text-[var(--text-secondary)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Bell aria-hidden className="size-4" />
        {notifications.count > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--negative)] px-1 text-[10px] font-semibold leading-none text-white">
            {notifications.count > 99 ? "99+" : notifications.count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-80 rounded-lg border border-[color:var(--border-muted)] bg-white p-2 shadow-[var(--shadow-panel)]">
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Action required
          </p>
          {notifications.items.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-[var(--text-muted)]">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="grid gap-0.5">
              {notifications.items.map((item) => (
                <li key={item.id}>
                  <Link
                    className="block rounded-md px-2 py-2 transition hover:bg-[var(--brand-tint)]"
                    href={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {item.label}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {item.detail} · {item.meta}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
