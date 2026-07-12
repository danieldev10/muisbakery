import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ManagementAuditReport } from "@/lib/management/types";
import {
  paginatedApiPath,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

import {
  formatAction,
  formatDateTime,
  ManagementPageShell,
} from "../_components";

export default async function ManagementAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const report = await apiGet<ManagementAuditReport>(
    paginatedApiPath("/management/audit-log", params, [
      "q",
      "role",
      "entity",
      "from",
      "to",
    ]),
  );
  const pagination =
    report.pagination ?? {
      page: 1,
      pageCount: 1,
      pageSize: report.entries.length,
      total: report.entries.length,
      rangeStart: report.entries.length > 0 ? 1 : 0,
      rangeEnd: report.entries.length,
    };
  const roleOptions = report.roleActivity.map((entry) => ({
    label: entry.role,
    value: entry.role,
  }));
  const entityOptions = report.entityActivity.map((entry) => ({
    label: entry.entityType,
    value: entry.entityType,
  }));

  return (
    <ManagementPageShell>
      <Card title={`Latest events (${pagination.total})`}>
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
        {pagination.total === 0 ? (
          <EmptyState>No audit events have been recorded yet.</EmptyState>
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
            {report.entries.map((entry) => (
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
    </ManagementPageShell>
  );
}
