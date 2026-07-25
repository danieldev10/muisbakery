import { ExternalLink, Pencil } from "lucide-react";
import Link from "next/link";

import { Field, SelectField } from "@/components/admin/form-controls";
import { AdminFormModal } from "@/components/admin/form-modal";
import {
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { PosTerminal } from "@/lib/admin/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import { createPosTerminal, updatePosTerminal } from "./actions";

const PATH = "/admin/pos-terminals";
const secondaryButtonClass =
  "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]";

function formatDate(value: string) {
  return new Date(value).toLocaleString("en", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function sessionLabel(terminal: PosTerminal) {
  const session = terminal.currentSession;

  if (!session) {
    return "No sale yet";
  }

  if (session.status === "ACTIVE") {
    return "Sale in progress";
  }

  if (session.status === "COMPLETED") {
    return "Last sale completed";
  }

  return "Idle";
}

export default async function SalesCountersPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const terminals = await apiGet<PosTerminal[]>("/admin/pos-terminals");
  const query = firstParam(params, "q");
  const statusFilter = firstParam(params, "status");
  const filtered = terminals.filter(
    (terminal) =>
      matchesSearch(query, [
        terminal.name,
        terminal.id,
        terminal.currentSession?.status,
      ]) && matchesSelect(statusFilter, terminal.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filtered,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">
            Sales counters ({filtered.length} of {terminals.length})
          </h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Named checkout points used by Sales and the customer-facing display.
          </p>
        </div>
        <AdminFormModal
          action={createPosTerminal}
          description="Create a counter that cashiers can select before starting a sale."
          submitLabel="Create counter"
          title="Create sales counter"
          triggerLabel="Create counter"
        >
          <Field
            label="Counter name"
            name="name"
            placeholder="Front counter"
            required
          />
        </AdminFormModal>
      </div>

      {terminals.length > 0 ? (
        <TableToolbar
          basePath={PATH}
          searchParams={params}
          searchPlaceholder="Search counter name, ID, or sale status"
          selectFilters={[
            {
              label: "Status",
              name: "status",
              options: [
                { label: "Active", value: "true" },
                { label: "Inactive", value: "false" },
              ],
            },
          ]}
        />
      ) : null}

      {terminals.length === 0 ? (
        <EmptyState>No sales counters have been created.</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>No counters match the current filters.</EmptyState>
      ) : (
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Counter</th>
              <th className="py-2 pr-4">Current state</th>
              <th className="py-2 pr-4">Customer display</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </>
          }
        >
          {pageItems.map((terminal) => (
            <tr
              className={terminal.isActive ? "align-middle" : "align-middle opacity-55"}
              key={terminal.id}
            >
              <td className="py-3 pr-4">
                <p className="font-medium text-[var(--text-primary)]">
                  {terminal.name || "Unnamed counter"}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Created {formatDate(terminal.createdAt)}
                </p>
              </td>
              <td className="py-3 pr-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  {sessionLabel(terminal)}
                </p>
                {terminal.currentSession?.status === "ACTIVE" ? (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {terminal.currentSession.customerType === "RETAILER"
                      ? "Retailer"
                      : "Individual"}{" "}
                    customer
                  </p>
                ) : null}
              </td>
              <td className="py-3 pr-4">
                <Link
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--brand-burgundy)] hover:underline"
                  href={`/customer-display/terminal/${terminal.displayToken}`}
                  target="_blank"
                >
                  Open display
                  <ExternalLink aria-hidden className="size-3.5" />
                </Link>
              </td>
              <td className="py-3 pr-4">
                <StatusBadge active={terminal.isActive} />
              </td>
              <td className="py-3 pr-4">
                <AdminFormModal
                  action={updatePosTerminal}
                  description="Update the counter or rotate its public customer-display link."
                  submitLabel="Save changes"
                  title={`Edit ${terminal.name || "counter"}`}
                  triggerClassName={secondaryButtonClass}
                  triggerIcon={<Pencil aria-hidden className="size-4" />}
                  triggerLabel="Edit"
                >
                  <input name="id" type="hidden" value={terminal.id} />
                  <Field
                    defaultValue={terminal.name ?? ""}
                    label="Counter name"
                    name="name"
                    required
                  />
                  <SelectField
                    defaultValue={String(terminal.isActive)}
                    label="Status"
                    name="isActive"
                    options={[
                      { label: "Active", value: "true" },
                      { label: "Inactive", value: "false" },
                    ]}
                    required
                  />
                  <SelectField
                    defaultValue="false"
                    hint="Rotating invalidates the old customer-display link."
                    label="Customer-display link"
                    name="rotateDisplayToken"
                    options={[
                      { label: "Keep current link", value: "false" },
                      { label: "Generate a new link", value: "true" },
                    ]}
                    required
                  />
                </AdminFormModal>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <TablePagination basePath={PATH} searchParams={params} {...pagination} />
    </Card>
  );
}
