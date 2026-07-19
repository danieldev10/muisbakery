import { AdminFormModal, AdminModal } from "@/components/admin/form-modal";
import { Field, SelectField } from "@/components/admin/form-controls";
import { Card, EmptyState, StatusBadge, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { PosTerminal, Product } from "@/lib/admin/types";
import type { Retailer, SalesInventoryItem } from "@/lib/operations/types";
import type { ReactNode } from "react";
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

import {
  adjustTerminalStock,
  createPosTerminal,
  rePairPosTerminal,
  setTerminalRetailerCreditAllocation,
  setTerminalStockAllocation,
  updatePosTerminal,
} from "./actions";
import {
  StockAllocationFields,
  type PosStockAllocationOption,
} from "./stock-allocation-fields";

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
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

function formatQuantity(value: string | number, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 0,
  })} ${unit}`;
}

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pairingLabel(terminal: PosTerminal) {
  if (terminal.pairedAt) {
    return "Paired";
  }

  return terminal.pairable ? "Pairing code active" : "Not paired";
}

function sessionLabel(terminal: PosTerminal) {
  return terminal.currentSession
    ? `Session ${terminal.currentSession.status.toLowerCase()}`
    : "No current session";
}

function stockAllocationOptions(
  terminal: PosTerminal,
  products: Product[],
  inventory: SalesInventoryItem[],
  terminals: PosTerminal[],
): PosStockAllocationOption[] {
  const centralByProduct = new Map(
    inventory.map((item) => [item.product.id, Number(item.totalRemaining)]),
  );
  const terminalRemainingByProduct = new Map<string, number>();

  for (const registeredTerminal of terminals) {
    for (const allocation of registeredTerminal.stockAllocations) {
      terminalRemainingByProduct.set(
        allocation.product.id,
        (terminalRemainingByProduct.get(allocation.product.id) ?? 0) +
          Number(allocation.remainingQuantity),
      );
    }
  }

  return products.map((product) => {
    const existing = terminal.stockAllocations.find(
      (allocation) => allocation.product.id === product.id,
    );
    const centralAvailable = centralByProduct.get(product.id) ?? 0;

    return {
      id: product.id,
      label: product.size
        ? `${product.name} (${product.size})`
        : product.name,
      unit: product.unit.abbreviation,
      centralAvailable,
      systemAvailable:
        centralAvailable + (terminalRemainingByProduct.get(product.id) ?? 0),
      currentAllocated: Number(existing?.allocatedQuantity ?? 0),
      currentSold: Number(existing?.soldQuantity ?? 0),
      currentRemaining: Number(existing?.remainingQuantity ?? 0),
    };
  });
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="grid gap-1 rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </p>
      <div className="text-sm font-medium text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}

function PosTerminalDetailsModal({ terminal }: { terminal: PosTerminal }) {
  return (
    <AdminModal
      description="Setup, pairing, allocation, and session details."
      title={terminal.name || "Unnamed terminal"}
      triggerClassName={secondaryButtonClass}
      triggerIcon={null}
      triggerLabel="Details"
      widthClassName="max-w-4xl"
    >
      <div className="grid gap-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DetailRow
            label="Setup ID"
            value={
              <code className="break-all rounded-[5px] border border-[color:var(--border-muted)] bg-white px-2 py-1 text-xs text-[var(--text-secondary)]">
                {terminal.id}
              </code>
            }
          />
          <DetailRow label="Status" value={<StatusBadge active={terminal.isActive} />} />
          <DetailRow
            label="Offline mode"
            value={<OfflineBadge enabled={terminal.offlineEnabled} />}
          />
          <DetailRow label="Pairing" value={pairingLabel(terminal)} />
          <DetailRow
            label="Pairing code"
            value={
              terminal.pairedAt
                ? "Used — device paired"
                : terminal.pairable
                  ? `Active · expires ${formatDate(terminal.pairingCodeExpiresAt)}`
                  : "None active — use New code"
            }
          />
          <DetailRow
            label="Paired at"
            value={formatDate(terminal.pairedAt)}
          />
          <DetailRow
            label="Paired by"
            value={
              terminal.pairedBy
                ? terminal.pairedBy.name ?? terminal.pairedBy.email
                : "-"
            }
          />
          <DetailRow label="Current session" value={sessionLabel(terminal)} />
          <DetailRow label="Last seen" value={formatDate(terminal.lastSeenAt)} />
          <DetailRow
            label="Last synced"
            value={formatDate(terminal.lastSyncedAt)}
          />
        </section>

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Stock allocations
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Finished goods physically transferred from central Sales stock to this terminal.
            </p>
          </div>
          {terminal.stockAllocations.length > 0 ? (
            <div className="overflow-hidden rounded-[5px] border border-[color:var(--border-muted)]">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Allocated</th>
                    <th className="px-3 py-2">Sold</th>
                    <th className="px-3 py-2">Remaining</th>
                    <th className="px-3 py-2">Custody batches</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-muted)]">
                  {terminal.stockAllocations.map((allocation) => (
                    <tr key={allocation.id}>
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                        {allocation.product.name}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatQuantity(
                          allocation.allocatedQuantity,
                          allocation.product.unit.abbreviation,
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatQuantity(
                          allocation.soldQuantity,
                          allocation.product.unit.abbreviation,
                        )}
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                        {formatQuantity(
                          allocation.remainingQuantity,
                          allocation.product.unit.abbreviation,
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {allocation.batches.filter(
                          (batch) => Number(batch.quantityRemaining) > 0,
                        ).length > 0
                          ? allocation.batches
                              .filter(
                                (batch) => Number(batch.quantityRemaining) > 0,
                              )
                              .map(
                                (batch) =>
                                  `Batch ${batch.sourceBatch.batchNumber}: ${formatQuantity(
                                    batch.quantityRemaining,
                                    allocation.product.unit.abbreviation,
                                  )}`,
                              )
                              .join(", ")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-[5px] border border-dashed border-[color:var(--border-muted)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No stock has been allocated to this terminal.
            </p>
          )}
        </section>

        <section className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
              Retailer credit allocations
            </h3>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Retailer credit exposure reserved for this terminal.
            </p>
          </div>
          {terminal.retailerCreditAllocations.length > 0 ? (
            <div className="overflow-hidden rounded-[5px] border border-[color:var(--border-muted)]">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2">Retailer</th>
                    <th className="px-3 py-2">Allocated</th>
                    <th className="px-3 py-2">Used</th>
                    <th className="px-3 py-2">Remaining</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-muted)]">
                  {terminal.retailerCreditAllocations.map((allocation) => (
                    <tr key={allocation.id}>
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                        {allocation.retailer.name}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatMoney(allocation.allocatedAmount)}
                      </td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">
                        {formatMoney(allocation.usedAmount)}
                      </td>
                      <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                        {formatMoney(allocation.remainingAmount)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge active={allocation.isActive} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-[5px] border border-dashed border-[color:var(--border-muted)] px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              No retailer credit has been allocated to this terminal.
            </p>
          )}
        </section>
      </div>
    </AdminModal>
  );
}

export default async function PosTerminalsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [terminals, products, retailers, inventory] = await Promise.all([
    apiGet<PosTerminal[]>("/admin/pos-terminals"),
    apiGet<Product[]>("/admin/products"),
    apiGet<Retailer[]>("/admin/retailers"),
    apiGet<SalesInventoryItem[]>("/sales/inventory"),
  ]);
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
          <Field
            hint="Share this once with the cashier. It expires after one hour and is consumed immediately after pairing."
            label="Pairing code"
            name="pairingCode"
            required
            type="password"
          />
          <SelectField
            defaultValue="false"
            hint="Offline-enabled terminals must have stock and retailer credit allocations before offline POS rollout."
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
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Pairing</th>
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
                  {sessionLabel(terminal)}
                </div>
              </td>
              <td className="py-3 pr-4">
                <StatusBadge active={terminal.isActive} />
              </td>
              <td className="py-3 pr-4 text-sm text-stone-600">
                {pairingLabel(terminal)}
              </td>
              <td className="py-3 pr-4">
                <OfflineBadge enabled={terminal.offlineEnabled} />
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatDate(terminal.lastSeenAt)}
              </td>
              <td className="py-3 pr-4">
                <div className="flex flex-wrap items-center gap-2">
                  <PosTerminalDetailsModal terminal={terminal} />
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
                        defaultValue={
                          terminal.offlineEnabled ? "true" : "false"
                        }
                        hint="Require terminal allocation checks during POS sales."
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
                  <AdminFormModal
                    action={rePairPosTerminal}
                    description={
                      terminal.pairedAt
                        ? "This immediately revokes the currently paired browser. Confirm that any offline sales on that device have synced first."
                        : "Replace the current or expired pairing code with a new one-hour, single-use code."
                    }
                    submitLabel={
                      terminal.pairedAt ? "Revoke and re-pair" : "Create new code"
                    }
                    title="Reset terminal pairing"
                    triggerClassName={secondaryButtonClass}
                    triggerIcon={null}
                    triggerLabel={terminal.pairedAt ? "Re-pair" : "New code"}
                  >
                    <input
                      name="terminalId"
                      type="hidden"
                      value={terminal.id}
                    />
                    <Field
                      hint="Use at least 6 characters. The code expires after one hour and can only be used once."
                      label="New pairing code"
                      name="pairingCode"
                      required
                      type="password"
                    />
                  </AdminFormModal>
                  <AdminFormModal
                    action={setTerminalStockAllocation}
                    description={terminal.name || terminal.id}
                    submitLabel="Save allocation"
                    title="Allocate POS stock"
                    triggerClassName={secondaryButtonClass}
                    triggerIcon={null}
                    triggerLabel="Stock"
                  >
                    <input name="terminalId" type="hidden" value={terminal.id} />
                    <StockAllocationFields
                      options={stockAllocationOptions(
                        terminal,
                        products,
                        inventory,
                        terminals,
                      )}
                    />
                  </AdminFormModal>
                  {terminal.stockAllocations.some((allocation) =>
                    allocation.batches.some(
                      (batch) => Number(batch.quantityRemaining) > 0,
                    ),
                  ) ? (
                    <AdminFormModal
                      action={adjustTerminalStock}
                      description="Record a supervised physical count correction. This does not release stock to central Sales custody."
                      submitLabel="Record adjustment"
                      title="Adjust terminal stock"
                      triggerClassName={secondaryButtonClass}
                      triggerIcon={null}
                      triggerLabel="Adjust"
                    >
                      <input
                        name="terminalId"
                        type="hidden"
                        value={terminal.id}
                      />
                      <SelectField
                        label="Custody batch"
                        name="terminalBatchId"
                        options={terminal.stockAllocations.flatMap(
                          (allocation) =>
                            allocation.batches
                              .filter(
                                (batch) =>
                                  Number(batch.quantityRemaining) > 0,
                              )
                              .map((batch) => ({
                                label: `${allocation.product.name} · source batch ${batch.sourceBatch.batchNumber} · ${formatQuantity(
                                  batch.quantityRemaining,
                                  allocation.product.unit.abbreviation,
                                )} recorded`,
                                value: batch.id,
                              })),
                        )}
                        required
                      />
                      <Field
                        hint="Enter the physical quantity counted at this terminal."
                        label="Counted quantity"
                        min="0"
                        name="countedQuantity"
                        required
                        step="1"
                        type="number"
                      />
                      <Field
                        label="Reason"
                        name="reason"
                        placeholder="e.g. Supervisor recount after breakage"
                        required
                      />
                    </AdminFormModal>
                  ) : null}
                  <AdminFormModal
                    action={setTerminalRetailerCreditAllocation}
                    description={terminal.name || terminal.id}
                    submitLabel="Save allocation"
                    title="Allocate retailer credit"
                    triggerClassName={secondaryButtonClass}
                    triggerIcon={null}
                    triggerLabel="Credit"
                  >
                    <input name="terminalId" type="hidden" value={terminal.id} />
                    <SelectField
                      label="Retailer"
                      name="retailerId"
                      options={retailers
                        .filter((retailer) => retailer.isActive)
                        .map((retailer) => ({
                          label: retailer.name,
                          value: retailer.id,
                        }))}
                      required
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        label="Allocated amount"
                        min="0.01"
                        name="allocatedAmount"
                        required
                        step="0.01"
                        type="number"
                      />
                      <SelectField
                        defaultValue="true"
                        label="Status"
                        name="isActive"
                        options={statusOptions}
                        required
                      />
                    </div>
                    <p className="-mt-2 text-xs leading-5 text-[var(--text-muted)]">
                      Maximum unpaid retailer credit this terminal can carry
                      before sync/review.
                    </p>
                  </AdminFormModal>
                </div>
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
