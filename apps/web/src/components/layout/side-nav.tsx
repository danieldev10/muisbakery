"use client";

import {
  BookOpen,
  Boxes,
  ChartColumn,
  ChevronDown,
  CircleDollarSign,
  Factory,
  History,
  LayoutDashboard,
  Menu,
  MonitorUp,
  Package,
  PackageCheck,
  PackageOpen,
  PackageX,
  ReceiptText,
  RotateCcw,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wheat,
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";

import type { NavItem } from "@/lib/navigation";

const sidebarStorageKey = "muisbakery.sidebarCollapsed";
const sidebarStorageEvent = "muisbakery-sidebar-collapsed-change";

type IconComponent = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

const iconByHref: Record<string, IconComponent> = {
  "/admin/dashboard": LayoutDashboard,
  "/admin/users": Users,
  "/admin/raw-materials": Wheat,
  "/admin/products": Package,
  "/admin/suppliers": Truck,
  "/admin/retailers": ReceiptText,
  "/admin/pos-terminals": MonitorUp,
  "/admin/pos-sync": History,
  "/admin/recipes": BookOpen,
  "/admin/units": Boxes,
  "/admin/expense-categories": CircleDollarSign,
  "/store/inventory": Warehouse,
  "/store/dashboard": LayoutDashboard,
  "/store/receiving": PackageCheck,
  "/store/requests": ClipboardList,
  "/production/requests": ClipboardList,
  "/production/inventory": Boxes,
  "/production/output": Factory,
  "/production/runs": ClipboardList,
  "/production/waste": PackageX,
  "/sales/pos": ShoppingCart,
  "/sales/inventory": PackageOpen,
  "/sales/record-sale": ReceiptText,
  "/sales/daily-summary": ChartColumn,
  "/sales/returns": RotateCcw,
  "/management/dashboard": LayoutDashboard,
  "/management/profit-loss": CircleDollarSign,
  "/management/inventory": Warehouse,
  "/management/inventory/raw-materials": Wheat,
  "/management/inventory/finished-goods": PackageOpen,
  "/management/production": Factory,
  "/management/production/runs": ClipboardList,
  "/management/production/raw-material-usage": Wheat,
  "/management/sales": ChartColumn,
  "/management/audit-log": History,
};

function isActive(pathname: string, href: string) {
  if (href.endsWith("/dashboard")) {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getNavIcon(item: NavItem) {
  if (item.href && iconByHref[item.href]) {
    return iconByHref[item.href];
  }

  return ClipboardList;
}

function isChildActive(pathname: string, parent: NavItem, child: NavItem) {
  if (!child.href) {
    return false;
  }

  if (child.href === parent.href) {
    return pathname === child.href;
  }

  return isActive(pathname, child.href);
}

function getSidebarCollapsedSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(sidebarStorageKey) === "true";
}

function getSidebarCollapsedServerSnapshot() {
  return false;
}

function subscribeToSidebarCollapsed(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => onStoreChange();
  const handleStorage = (event: StorageEvent) => {
    if (event.key === sidebarStorageKey) {
      onStoreChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(sidebarStorageEvent, handleChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(sidebarStorageEvent, handleChange);
  };
}

export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<
    Record<string, boolean>
  >({});
  const collapsed = useSyncExternalStore(
    subscribeToSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getSidebarCollapsedServerSnapshot,
  );

  useEffect(() => {
    if (!pendingHref || !isActive(pathname, pendingHref)) {
      return;
    }

    const timer = window.setTimeout(() => {
      setPendingHref(null);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [pathname, pendingHref]);

  function toggleCollapsed() {
    const nextValue = !collapsed;
    window.localStorage.setItem(sidebarStorageKey, String(nextValue));
    window.dispatchEvent(new Event(sidebarStorageEvent));
  }

  function handleNavClick(href: string) {
    if (!isActive(pathname, href)) {
      setPendingHref(href);
    }
  }

  function toggleGroup(item: NavItem) {
    const key = item.href ?? item.label;
    const active = item.children?.some((child) =>
      isChildActive(pathname, item, child),
    );
    const currentlyExpanded = expandedGroups[key] ?? Boolean(active);

    if (collapsed) {
      window.localStorage.setItem(sidebarStorageKey, "false");
      window.dispatchEvent(new Event(sidebarStorageEvent));
      setExpandedGroups((current) => ({ ...current, [key]: true }));
      return;
    }

    setExpandedGroups((current) => ({
      ...current,
      [key]: !currentlyExpanded,
    }));
  }

  return (
    <aside
      className={
        collapsed
          ? "sticky top-16 h-[calc(100vh-4rem)] w-[72px] shrink-0 overflow-y-auto overflow-x-hidden border-r border-[color:var(--border-muted)] bg-[var(--surface)] text-[var(--text-secondary)] transition-[width] duration-200"
          : "sticky top-16 h-[calc(100vh-4rem)] w-[264px] shrink-0 overflow-y-auto overflow-x-hidden border-r border-[color:var(--border-muted)] bg-[var(--surface)] text-[var(--text-secondary)] transition-[width] duration-200"
      }
    >
      <div
        className={
          collapsed
            ? "flex h-14 items-center justify-center border-b border-[color:var(--border-muted)] px-2"
            : "flex h-14 items-center justify-between gap-2 border-b border-[color:var(--border-muted)] px-3"
        }
      >
        {collapsed ? null : (
          <p className="truncate text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Menu
          </p>
        )}
        <button
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="inline-flex size-9 items-center justify-center rounded-md border border-[color:var(--border-muted)] bg-white text-[var(--text-muted)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]"
          onClick={toggleCollapsed}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          <Menu aria-hidden={true} className="size-5" />
        </button>
      </div>

      <nav aria-label="Main navigation" className="grid gap-1 p-2">
        {items.map((item) => {
          const Icon = getNavIcon(item);

          if (item.children?.length) {
            const groupKey = item.href ?? item.label;
            const groupActive = item.children.some((child) =>
              isChildActive(pathname, item, child),
            );
            const expanded = expandedGroups[groupKey] ?? groupActive;

            return (
              <div className="grid gap-1" key={item.label}>
                <button
                  aria-expanded={expanded}
                  className={
                    groupActive
                      ? collapsed
                        ? "inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--brand-tint)] text-[var(--brand-burgundy)] ring-1 ring-[var(--brand-tint-strong)]"
                        : "inline-flex h-10 w-full items-center gap-3 rounded-md bg-[var(--brand-tint)] px-3 text-sm font-semibold text-[var(--brand-burgundy)] ring-1 ring-[var(--brand-tint-strong)]"
                      : collapsed
                        ? "inline-flex h-10 w-full items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--brand-tint)] hover:text-[var(--brand-burgundy)]"
                        : "inline-flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--brand-tint)] hover:text-[var(--brand-burgundy)]"
                  }
                  onClick={() => toggleGroup(item)}
                  title={item.label}
                  type="button"
                >
                  <Icon aria-hidden={true} className="size-5 shrink-0" />
                  {collapsed ? (
                    <span className="sr-only">{item.label}</span>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left">
                        {item.label}
                      </span>
                      <ChevronDown
                        aria-hidden={true}
                        className={`size-4 shrink-0 transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </>
                  )}
                </button>

                {!collapsed && expanded ? (
                  <div className="ml-5 grid gap-1 border-l border-[color:var(--border-muted)] pl-3">
                    {item.children.map((child) => {
                      if (!child.href) {
                        return null;
                      }

                      const childHref = child.href;
                      const ChildIcon = getNavIcon(child);
                      const childActive = isChildActive(
                        pathname,
                        item,
                        child,
                      );
                      const childPending =
                        pendingHref === childHref && !childActive;

                      return (
                        <Link
                          aria-busy={childPending ? "true" : undefined}
                          aria-current={childActive ? "page" : undefined}
                          className={
                            childActive
                              ? "relative inline-flex min-h-9 w-full items-center gap-2 rounded-md bg-[var(--brand-burgundy)] px-2.5 py-2 text-xs font-semibold text-white shadow-[var(--shadow-whisper)]"
                              : childPending
                                ? "relative inline-flex min-h-9 w-full items-center gap-2 rounded-md bg-[var(--brand-tint)] px-2.5 py-2 text-xs font-semibold text-[var(--brand-burgundy)]"
                                : "relative inline-flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--brand-tint)] hover:text-[var(--brand-burgundy)]"
                          }
                          href={childHref}
                          key={child.label}
                          onClick={() => handleNavClick(childHref)}
                          title={child.label}
                        >
                          <ChildIcon
                            aria-hidden={true}
                            className="size-4 shrink-0"
                          />
                          <span className="min-w-0 flex-1 whitespace-normal text-left leading-4">
                            {child.label}
                          </span>
                          {childPending ? (
                            <span
                              aria-hidden={true}
                              className="size-2 shrink-0 rounded-full bg-[var(--brand-burgundy)]"
                            />
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          }

          if (!item.href) {
            return (
              <span
                className={
                  collapsed
                    ? "inline-flex h-10 w-full items-center justify-center rounded-md text-[var(--text-muted)]"
                    : "inline-flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--text-muted)]"
                }
                key={item.label}
                title={item.label}
              >
                <Icon aria-hidden={true} className="size-5 shrink-0" />
                {collapsed ? (
                  <span className="sr-only">{item.label}</span>
                ) : (
                  <span className="min-w-0 truncate whitespace-nowrap">
                    {item.label}
                  </span>
                )}
              </span>
            );
          }

          const href = item.href;
          const active = isActive(pathname, href);
          const pending = pendingHref === href && !active;

          return (
            <Link
              aria-current={active ? "page" : undefined}
              aria-busy={pending ? "true" : undefined}
              className={
                active
                  ? collapsed
                    ? "relative inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--brand-burgundy)] text-white shadow-[var(--shadow-whisper)]"
                    : "relative inline-flex h-10 w-full items-center gap-3 rounded-md bg-[var(--brand-burgundy)] px-3 text-sm font-semibold text-white shadow-[var(--shadow-whisper)]"
                  : pending
                    ? collapsed
                      ? "relative inline-flex h-10 w-full items-center justify-center rounded-md bg-[var(--brand-tint)] text-[var(--brand-burgundy)] ring-1 ring-[var(--brand-tint-strong)]"
                      : "relative inline-flex h-10 w-full items-center gap-3 rounded-md bg-[var(--brand-tint)] px-3 text-sm font-semibold text-[var(--brand-burgundy)] ring-1 ring-[var(--brand-tint-strong)]"
                  : collapsed
                    ? "relative inline-flex h-10 w-full items-center justify-center rounded-md text-[var(--text-secondary)] transition hover:bg-[var(--brand-tint)] hover:text-[var(--brand-burgundy)]"
                    : "relative inline-flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-[var(--brand-tint)] hover:text-[var(--brand-burgundy)]"
              }
              href={href}
              key={item.label}
              onClick={() => handleNavClick(href)}
              title={item.label}
            >
              <Icon aria-hidden={true} className="size-5 shrink-0" />
              {collapsed ? (
                <span className="sr-only">{item.label}</span>
              ) : (
                <span className="min-w-0 truncate whitespace-nowrap">
                  {item.label}
                </span>
              )}
              {pending ? (
                <span
                  aria-hidden={true}
                  className={
                    collapsed
                      ? "absolute right-1.5 top-1.5 size-2 rounded-full bg-[var(--brand-burgundy)] shadow-[0_0_0_3px_var(--brand-tint)]"
                      : "ml-auto size-2 rounded-full bg-[var(--brand-burgundy)] shadow-[0_0_0_3px_var(--brand-tint-strong)]"
                  }
                />
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
