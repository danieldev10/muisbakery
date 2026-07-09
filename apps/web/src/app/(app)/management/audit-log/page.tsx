import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ManagementAuditReport } from "@/lib/management/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesDateRange,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import { formatAction, formatDateTime } from "../_components";

export default async function ManagementAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const report = await apiGet<ManagementAuditReport>("/management/audit-log");
  const query = firstParam(params, "q");
  const roleFilter = firstParam(params, "role");
  const entityFilter = firstParam(params, "entity");
  const from = firstParam(params, "from");
  const to = firstParam(params, "to");
  const roleOptions = report.roleActivity.map((entry) => ({
    label: entry.role,
    value: entry.role,
  }));
  const entityOptions = report.entityActivity.map((entry) => ({
    label: entry.entityType,
    value: entry.entityType,
  }));
  const filteredEntries = report.entries.filter(
    (entry) =>
      matchesSearch(query, [
        formatAction(entry.action),
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.actor?.name,
        entry.actor?.email,
        entry.actor?.role,
      ]) &&
      matchesSelect(roleFilter, entry.actor?.role ?? "") &&
      matchesSelect(entityFilter, entry.entityType) &&
      matchesDateRange(entry.createdAt, from, to),
  );
  const { pageItems, ...pagination } = paginate(
    filteredEntries,
    pageNumber(params.page),
  );

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Recent workflow activity across Store, Production, Sales, and Management."
      />

      <Card title={`Latest events (${filteredEntries.length} of ${report.entries.length})`}>
        {report.entries.length > 0 ? (
          <TableToolbar
            basePath="/management/audit-log"
            dateFilters={[
              { label: "From", name: "from" },
              { label: "To", name: "to" },
            ]}
            searchParams={params}
            searchPlaceholder="Search action, record, actor, or reference"
            selectFilters={[
              {
                label: "Role",
                name: "role",
                options: roleOptions,
              },
              {
                label: "Record",
                name: "entity",
                options: entityOptions,
              },
            ]}
          />
        ) : null}
        {report.entries.length === 0 ? (
          <EmptyState>No audit events have been recorded yet.</EmptyState>
        ) : filteredEntries.length === 0 ? (
          <EmptyState>No audit events match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Record</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Time</th>
              </>
            }
          >
            {pageItems.map((entry) => (
              <tr className="align-top" key={entry.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatAction(entry.action)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {entry.entityType}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {entry.actor?.name ?? entry.actor?.email ?? "System"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDateTime(entry.createdAt)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/management/audit-log"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
