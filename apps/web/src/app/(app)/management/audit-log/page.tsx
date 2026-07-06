import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementAuditReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import { formatAction, formatDateTime } from "../_components";

function formatMetadata(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "Unable to display metadata";
  }
}

export default async function ManagementAuditLogPage() {
  const report = await apiGet<ManagementAuditReport>("/management/audit-log");

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Recent workflow activity across Store, Production, Sales, and Management."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Department activity">
          {report.roleActivity.length === 0 ? (
            <EmptyState>No recent department activity.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Role</th>
                  <th className="py-2 pr-4">Actions</th>
                </>
              }
            >
              {report.roleActivity.map((entry) => (
                <tr key={entry.role}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {entry.role}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">{entry.count}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>

        <Card title="Activity by record type">
          {report.entityActivity.length === 0 ? (
            <EmptyState>No recent record activity.</EmptyState>
          ) : (
            <TableShell
              head={
                <>
                  <th className="py-2 pr-4">Record type</th>
                  <th className="py-2 pr-4">Actions</th>
                </>
              }
            >
              {report.entityActivity.map((entry) => (
                <tr key={entry.entityType}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {entry.entityType}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">{entry.count}</td>
                </tr>
              ))}
            </TableShell>
          )}
        </Card>
      </div>

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
                <th className="py-2 pr-4">Metadata</th>
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
                  <p>{entry.entityType}</p>
                  {entry.entityId ? (
                    <p className="mt-1 max-w-44 truncate text-xs text-stone-400">
                      {entry.entityId}
                    </p>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {entry.actor?.name ?? entry.actor?.email ?? "System"}
                </td>
                <td className="max-w-72 py-3 pr-4 text-xs text-stone-500">
                  <pre className="whitespace-pre-wrap break-words font-mono">
                    {formatMetadata(entry.metadata)}
                  </pre>
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
