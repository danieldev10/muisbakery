import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Boxes,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ComponentType } from "react";

import { API_UNREACHABLE, getCurrentUser } from "@/lib/auth";
import type { AppRole } from "@/lib/roles";
import { getRoleHome } from "@/lib/roles";
import { apiGet } from "@/lib/server-api";

type DashboardTone = "default" | "good" | "warning" | "danger";

type DashboardCard = {
  label: string;
  value: string;
  detail?: string;
  tone?: DashboardTone;
};

type DashboardAction = {
  label: string;
  href: string;
  description: string;
};

type DashboardItem = {
  id: string;
  title: string;
  detail?: string;
  department?: string;
  meta?: string;
  reference?: string;
  value?: string;
  tone?: DashboardTone;
  href?: string;
};

type DashboardSection = {
  title: string;
  description?: string;
  emptyText: string;
  items: DashboardItem[];
  /** "table" renders the section as a full-width activity table. */
  layout?: "table";
};

type DashboardSummary = {
  role: AppRole;
  eyebrow: string;
  title: string;
  description: string;
  cards: DashboardCard[];
  actions: DashboardAction[];
  sections: DashboardSection[];
};

type IconComponent = ComponentType<{
  "aria-hidden"?: boolean;
  className?: string;
}>;

const cardIcons: IconComponent[] = [
  LayoutDashboard,
  ClipboardList,
  Boxes,
  ChartColumn,
];

function getToneClasses(tone: DashboardTone = "default") {
  if (tone === "good") {
    return {
      icon: "bg-emerald-50 text-emerald-800",
      value: "text-emerald-800",
      badge: "bg-emerald-50 text-emerald-800",
    };
  }

  if (tone === "warning") {
    return {
      icon: "bg-amber-50 text-amber-800",
      value: "text-amber-800",
      badge: "bg-amber-50 text-amber-800",
    };
  }

  if (tone === "danger") {
    return {
      icon: "bg-red-50 text-red-800",
      value: "text-red-800",
      badge: "bg-red-50 text-red-800",
    };
  }

  return {
    icon: "bg-stone-100 text-stone-700",
    value: "text-stone-950",
    badge: "bg-stone-100 text-stone-700",
  };
}

function formatDisplayTitle(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getDepartmentBadgeClasses(value?: string) {
  if (value === "STORE") {
    return "bg-amber-50 text-amber-800";
  }

  if (value === "PRODUCTION") {
    return "bg-sky-50 text-sky-800";
  }

  if (value === "SALES") {
    return "bg-emerald-50 text-emerald-800";
  }

  if (value === "MANAGEMENT") {
    return "bg-indigo-50 text-indigo-800";
  }

  if (value === "SYSTEM") {
    return "bg-stone-100 text-stone-700";
  }

  return "bg-red-50 text-red-800";
}

function getActivityBreakdown(
  items: DashboardItem[],
  getLabel: (item: DashboardItem) => string | undefined,
) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const label = getLabel(item) ?? "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, 5);
}

function getSectionPresentation() {
  return {
    Icon: LayoutDashboard,
    headerIcon: "bg-stone-100 text-stone-700 ring-stone-200",
    card: "border-stone-200",
    list: "grid gap-2",
  };
}

function MetricCard({
  card,
  index,
}: {
  card: DashboardCard;
  index: number;
}) {
  const Icon =
    card.tone === "warning" ? AlertTriangle : cardIcons[index] ?? BadgeCheck;
  const tone = getToneClasses(card.tone);

  return (
    <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-md ${tone.icon}`}
        >
          <Icon aria-hidden={true} className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-500">{card.label}</p>
          <p className={`mt-1 text-2xl font-semibold ${tone.value}`}>
            {card.value}
          </p>
          {card.detail ? (
            <p className="mt-1 text-sm text-stone-500">{card.detail}</p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ActionCard({ action }: { action: DashboardAction }) {
  return (
    <Link
      className="group rounded-md border border-stone-200 bg-white p-3 shadow-sm transition hover:border-red-200 hover:bg-red-50"
      href={action.href}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-stone-950">
            {action.label}
          </p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
            {action.description}
          </p>
        </div>
        <ArrowRight
          aria-hidden={true}
          className="mt-1 size-3.5 shrink-0 text-stone-400 transition group-hover:text-red-800"
        />
      </div>
    </Link>
  );
}

function SectionItem({ item }: { item: DashboardItem }) {
  const tone = getToneClasses(item.tone);
  const content = (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate font-medium text-stone-900">{item.title}</p>
        {item.detail ? (
          <p className="mt-1 line-clamp-2 text-sm text-stone-500">
            {item.detail}
          </p>
        ) : null}
        {item.meta ? (
          <p className="mt-1 text-xs text-stone-400">{item.meta}</p>
        ) : null}
      </div>
      {item.value ? (
        <span
          className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${tone.badge}`}
        >
          {item.value}
        </span>
      ) : null}
    </div>
  );

  if (item.href) {
    return (
      <li>
        <Link
          className="flex rounded-md border border-stone-100 p-3 transition hover:border-stone-200 hover:bg-stone-50"
          href={item.href}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li className="flex rounded-md border border-stone-100 p-3">
      {content}
    </li>
  );
}

function ActivityBreakdown({
  entries,
  title,
}: {
  entries: { label: string; value: number }[];
  title: string;
}) {
  const maxValue = Math.max(...entries.map((entry) => entry.value), 1);

  return (
    <div>
      <h3 className="text-sm font-semibold text-stone-950">{title}</h3>
      <div className="mt-3 grid gap-3">
        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 px-3 py-4 text-center text-xs text-stone-500">
            No activity yet.
          </p>
        ) : (
          entries.map((entry) => (
            <div className="grid gap-1.5" key={entry.label}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-stone-700">
                  {formatDisplayTitle(entry.label)}
                </span>
                <span className="font-semibold text-stone-950">
                  {entry.value}
                </span>
              </div>
              <div className="h-2 rounded-full bg-stone-100">
                {/* One measure across labels: a single hue, identity lives in the label. */}
                <div
                  className="h-2 rounded-full bg-[var(--chart-bar)]"
                  style={{
                    width: `${Math.max(8, (entry.value / maxValue) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActivityCharts({ items }: { items: DashboardItem[] }) {
  const departmentEntries = getActivityBreakdown(
    items,
    (item) => item.department,
  );
  const entityEntries = getActivityBreakdown(items, (item) => item.value);

  return (
    <aside className="grid content-start gap-5 border-t border-stone-200 p-4 lg:border-l lg:border-t-0">
      <ActivityBreakdown entries={departmentEntries} title="By department" />
      <div className="border-t border-stone-200 pt-5">
        <ActivityBreakdown entries={entityEntries} title="By entity" />
      </div>
    </aside>
  );
}

function ActivityTable({
  section,
  showBreakdown = true,
}: {
  section: DashboardSection;
  showBreakdown?: boolean;
}) {
  return (
    <section className="rounded-md border border-stone-200 bg-white shadow-sm xl:col-span-2">
      <div className="flex items-start gap-3 border-b border-stone-200 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-800 ring-1 ring-blue-100">
          <Activity aria-hidden={true} className="size-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-950">
            {section.title}
          </h2>
          {section.description ? (
            <p className="mt-1 text-sm text-stone-500">
              {section.description}
            </p>
          ) : null}
        </div>
      </div>

      {section.items.length === 0 ? (
        <p className="m-4 rounded-md border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
          {section.emptyText}
        </p>
      ) : (
        <div
          className={
            showBreakdown ? "grid lg:grid-cols-[minmax(0,1fr)_320px]" : "grid"
          }
        >
          <div className="overflow-x-auto">
            {/* table-fixed only applies with an explicit width; without w-full
                the table auto-sizes past its grid column and bleeds under the
                breakdown sidebar. */}
            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[19%]" />
                <col className="w-[10%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead className="border-b border-stone-200 bg-stone-50 text-xs font-semibold uppercase text-stone-500">
                <tr>
                  <th className="px-3 py-2.5">Activity</th>
                  <th className="px-3 py-2.5">Actor</th>
                  <th className="px-3 py-2.5">Dept.</th>
                  <th className="px-3 py-2.5">Entity</th>
                  <th className="px-3 py-2.5">Ref.</th>
                  <th className="px-3 py-2.5">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {section.items.map((item) => (
                  <tr className="hover:bg-stone-50" key={item.id}>
                    <td className="truncate px-3 py-2.5 font-medium text-stone-900">
                      {item.href ? (
                        <Link className="hover:text-red-800" href={item.href}>
                          {formatDisplayTitle(item.title)}
                        </Link>
                      ) : (
                        formatDisplayTitle(item.title)
                      )}
                    </td>
                    <td className="truncate px-3 py-2.5 text-stone-600">
                      {item.detail ?? "System"}
                    </td>
                    <td className="px-3 py-2.5">
                      {item.department ? (
                        <span
                          className={`rounded-md px-2 py-1 text-xs font-medium ${getDepartmentBadgeClasses(
                            item.department,
                          )}`}
                        >
                          {formatDisplayTitle(item.department)}
                        </span>
                      ) : (
                        <span className="text-stone-400">-</span>
                      )}
                    </td>
                    <td className="truncate px-3 py-2.5">
                      {item.value ? (
                        <span className="inline-block max-w-full truncate rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
                          {formatDisplayTitle(item.value)}
                        </span>
                      ) : (
                        <span className="text-stone-400">-</span>
                      )}
                    </td>
                    <td className="truncate px-3 py-2.5 font-mono text-xs text-stone-500">
                      {item.reference ?? "-"}
                    </td>
                    <td className="truncate px-3 py-2.5 text-stone-500">
                      {item.meta ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showBreakdown ? <ActivityCharts items={section.items} /> : null}
        </div>
      )}
    </section>
  );
}

function DashboardSectionCard({ section }: { section: DashboardSection }) {
  if (section.layout === "table") {
    return <ActivityTable section={section} showBreakdown={false} />;
  }

  if (section.title === "Latest activity") {
    return <ActivityTable section={section} />;
  }

  const sectionPresentation = getSectionPresentation();
  const SectionIcon = sectionPresentation.Icon;

  return (
    <section
      className={`rounded-md border bg-white p-5 shadow-sm ${sectionPresentation.card}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className={`grid size-10 shrink-0 place-items-center rounded-md ring-1 ${sectionPresentation.headerIcon}`}
        >
          <SectionIcon aria-hidden={true} className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-stone-950">
            {section.title}
          </h2>
          {section.description ? (
            <p className="mt-1 text-sm text-stone-500">
              {section.description}
            </p>
          ) : null}
        </div>
      </div>

      {section.items.length === 0 ? (
        <p className="rounded-md border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
          {section.emptyText}
        </p>
      ) : (
        <ul className={sectionPresentation.list}>
          {section.items.map((item) => (
            <SectionItem item={item} key={item.id} />
          ))}
        </ul>
      )}
    </section>
  );
}

export async function RoleDashboardPage({
  expectedRole,
}: {
  expectedRole: AppRole;
}) {
  const user = await getCurrentUser();

  if (user === API_UNREACHABLE) {
    redirect("/login?reason=api-unreachable");
  }

  if (!user) {
    redirect("/login");
  }

  if (user.role !== expectedRole) {
    redirect(getRoleHome(user.role));
  }

  const summary = await apiGet<DashboardSummary>("/dashboard/summary");
  // No intro banner: the header already names the workspace and user. Store
  // staff also skip the quick-link cards and go straight to the numbers.
  const showQuickActions = user.role !== "STORE";

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summary.cards.map((card, index) => (
          <MetricCard card={card} index={index} key={card.label} />
        ))}
      </section>

      {showQuickActions && summary.actions.length > 0 ? (
        <section className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {summary.actions.map((action) => (
            <ActionCard action={action} key={action.href} />
          ))}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        {summary.sections.map((section) => (
          <DashboardSectionCard section={section} key={section.title} />
        ))}
      </section>
    </div>
  );
}
