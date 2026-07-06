import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementAuditReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import { formatAction, formatDateTime } from "../_components";

export default async function ManagementAuditLogPage() {
  const report = await apiGet<ManagementAuditReport>("/management/audit-log");

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Recent workflow activity across Store, Production, Sales, and Management."
      />

      <Card title={`Latest events (${report.entries.length})`}>
        {report.entries.length === 0 ? (
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
      </Card>
    </>
  );
}
