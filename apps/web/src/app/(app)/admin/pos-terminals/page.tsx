import { AdminFormModal } from "@/components/admin/form-modal";
import { Field, SelectField } from "@/components/admin/form-controls";
import { Card, EmptyState, StatusBadge, TableShell } from "@/components/admin/layout";
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

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const statusOptions = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const offlineOptions = [
  { value: "false", label: "Disabled" },
  { value: "true", label: "Enabled" },
];

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "-";
}

function OfflineBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={
        enabled
          ? "inline-flex items-center rounded-[5px] border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800"
          : "inline-flex items-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--text-muted)]"
      }
    >
      {enabled ? "Offline enabled" : "Offline disabled"}
    </span>
  );
}

export default async function PosTerminalsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const terminals = await apiGet<PosTerminal[]>("/admin/pos-terminals");
  const query = firstParam(params, "q");
  const statusFilter = firstParam(params, "status");
  const offlineFilter = firstParam(params, "offline");
  const filteredTerminals = terminals.filter(
    (terminal) =>
      matchesSearch(query, [
        terminal.id,
        terminal.name,
        terminal.displayToken,
        terminal.currentSession?.status,
      ]) &&
      matchesSelect(statusFilter, terminal.isActive) &&
      matchesSelect(offlineFilter, terminal.offlineEnabled),
  );
  const { pageItems, ...pagination } = paginate(
    filteredTerminals,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            POS terminals ({filteredTerminals.length} of {terminals.length})
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Registered sales devices. Cashiers can only use terminals created here.
          </p>
        </div>
        <AdminFormModal
          action={createPosTerminal}
          description="Create a registered POS device before assigning it to a cashier."
          submitLabel="Create terminal"
          title="Create POS terminal"
          triggerLabel="Create terminal"
        >
          <Field label="Name" name="name" placeholder="e.g. Front counter POS" />
          <SelectField
            defaultValue="false"
            hint="Offline allocation is configured in a later offline POS phase."
            label="Offline mode"
            name="offlineEnabled"
            options={offlineOptions}
            required
          />
        </AdminFormModal>
      </div>

      {terminals.length > 0 ? (
        <TableToolbar
          basePath="/admin/pos-terminals"
          searchParams={params}
          searchPlaceholder="Search terminal name, ID, token, or session"
          selectFilters={[
            {
              label: "Status",
              name: "status",
              options: statusOptions,
            },
            {
              label: "Offline",
              name: "offline",
              options: offlineOptions,
            },
          ]}
        />
      ) : null}

      {terminals.length === 0 ? (
        <EmptyState>No POS terminals have been registered.</EmptyState>
      ) : filteredTerminals.length === 0 ? (
        <EmptyState>No terminals match the current filters.</EmptyState>
      ) : (
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Terminal</th>
              <th className="py-2 pr-4">Setup ID</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Offline</th>
              <th className="py-2 pr-4">Last seen</th>
              <th className="py-2 pr-4">Actions</th>
            </>
          }
        >
          {pageItems.map((terminal) => (
            <tr key={terminal.id}>
              <td className="py-3 pr-4">
                <div className="font-medium text-stone-900">
                  {terminal.name || "Unnamed terminal"}
                </div>
                <div className="text-xs text-stone-500">
                  {terminal.currentSession
                    ? `Current session: ${terminal.currentSession.status}`
                    : "No current session"}
                </div>
              </td>
              <td className="py-3 pr-4">
                <code className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                  {terminal.id}
                </code>
              </td>
              <td className="py-3 pr-4">
                <StatusBadge active={terminal.isActive} />
              </td>
              <td className="py-3 pr-4">
                <OfflineBadge enabled={terminal.offlineEnabled} />
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatDate(terminal.lastSeenAt)}
              </td>
              <td className="py-3 pr-4">
                <AdminFormModal
                  action={updatePosTerminal}
                  description={terminal.id}
                  submitLabel="Save changes"
                  title="Edit POS terminal"
                  triggerClassName={secondaryButtonClass}
                  triggerIcon={null}
                  triggerLabel="Edit"
                >
                  <input name="id" type="hidden" value={terminal.id} />
                  <Field
                    defaultValue={terminal.name ?? ""}
                    label="Name"
                    name="name"
                    placeholder="e.g. Front counter POS"
                  />
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      defaultValue={terminal.isActive ? "true" : "false"}
                      hint="Inactive terminals cannot be used by Sales."
                      label="Status"
                      name="isActive"
                      options={statusOptions}
                      required
                    />
                    <SelectField
                      defaultValue={terminal.offlineEnabled ? "true" : "false"}
                      hint="Reserved for the offline POS rollout."
                      label="Offline mode"
                      name="offlineEnabled"
                      options={offlineOptions}
                      required
                    />
                  </div>
                  <SelectField
                    defaultValue="false"
                    hint="Rotate if a customer display URL may have leaked. Open displays disconnect until reloaded from the terminal."
                    label="Display token"
                    name="rotateDisplayToken"
                    options={[
                      { value: "false", label: "Keep current token" },
                      { value: "true", label: "Rotate token now" },
                    ]}
                    required
                  />
                </AdminFormModal>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <TablePagination
        basePath="/admin/pos-terminals"
        searchParams={params}
        {...pagination}
      />
    </Card>
  );
}
