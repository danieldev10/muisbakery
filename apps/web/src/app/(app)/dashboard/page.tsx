import { Clock, ShieldCheck, UserRoundCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { getApiBaseUrl } from "@/lib/api";
import { getAuthCookieHeader, getCurrentUser } from "@/lib/auth";
import { roleLabels, roleScopes } from "@/lib/roles";

type DashboardSummary = {
  activeUserCount: number;
  auditLogCount: number;
  latestAuditLog: {
    action: string;
    createdAt: string;
  } | null;
};

async function getDashboardSummary() {
  const response = await fetch(`${getApiBaseUrl()}/dashboard/summary`, {
    cache: "no-store",
    headers: {
      cookie: await getAuthCookieHeader(),
    },
  });

  if (!response.ok) {
    return {
      activeUserCount: 0,
      auditLogCount: 0,
      latestAuditLog: null,
    } satisfies DashboardSummary;
  }

  return (await response.json()) as DashboardSummary;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const summary = await getDashboardSummary();

  const scopes = roleScopes[user.role];

  return (
    <div className="grid gap-6">
      <section className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-red-800">
              {roleLabels[user.role]} dashboard
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-stone-950">
              {user.name || user.email}
            </h1>
          </div>
          <div className="rounded-md border border-stone-200 px-3 py-2 text-sm text-stone-600">
            {user.email}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-red-50 text-red-800">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-stone-500">Role</p>
              <p className="text-lg font-semibold text-stone-950">
                {roleLabels[user.role]}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-emerald-50 text-emerald-800">
              <UserRoundCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-stone-500">
                Active users
              </p>
              <p className="text-lg font-semibold text-stone-950">
                {summary.activeUserCount}
              </p>
            </div>
          </div>
        </article>

        <article className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-md bg-sky-50 text-sky-800">
              <Clock aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium text-stone-500">
                Audit entries
              </p>
              <p className="text-lg font-semibold text-stone-950">
                {summary.auditLogCount}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-stone-950">
            Access scope
          </h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {scopes.map((scope) => (
              <span
                className="rounded-md border border-stone-200 bg-stone-50 px-3 py-1.5 text-sm font-medium capitalize text-stone-700"
                key={scope}
              >
                {scope}
              </span>
            ))}
          </div>
        </article>

        <article className="rounded-md border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-stone-950">
            Latest audit
          </h2>
          {summary.latestAuditLog ? (
            <div className="mt-4 grid gap-1 text-sm">
              <p className="font-medium text-stone-800">
                {summary.latestAuditLog.action}
              </p>
              <p className="text-stone-500">
                {new Date(summary.latestAuditLog.createdAt).toLocaleString(
                  "en",
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  },
                )}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-stone-500">No audit entries yet.</p>
          )}
        </article>
      </section>
    </div>
  );
}
