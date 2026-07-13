import { AdminModal } from "@/components/admin/form-modal";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type {
  PosOfflineSyncAttempt,
  PosOfflineSyncStatus,
  PosTerminal,
} from "@/lib/admin/types";
import {
  paginatedApiPath,
  type PaginatedResponse,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import { firstParam } from "@/lib/table-filters";

import { retryOfflineSyncAttempt } from "./actions";

const BASE_PATH = "/admin/pos-sync";

const statusOptions: Array<{ label: string; value: PosOfflineSyncStatus }> = [
  { label: "Synced", value: "SYNCED" },
  { label: "Duplicate", value: "DUPLICATE" },
  { label: "Conflict", value: "CONFLICT" },
  { label: "Failed", value: "FAILED" },
];

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const retryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] bg-[var(--brand-burgundy)] px-3 text-xs font-semibold text-white shadow-[var(--shadow-whisper)] transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:opacity-50";

function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "-";
}

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function statusBadge(status: PosOfflineSyncStatus) {
  const classes: Record<PosOfflineSyncStatus, string> = {
    SYNCED:
      "border-emerald-200 bg-emerald-50 text-emerald-800",
    DUPLICATE:
      "border-sky-200 bg-sky-50 text-sky-800",
    CONFLICT:
      "border-amber-200 bg-amber-50 text-amber-800",
    FAILED:
      "border-red-200 bg-red-50 text-red-800",
  };

  return (
    <span
      className={`inline-flex items-center rounded-[5px] border px-2.5 py-0.5 text-xs font-medium ${classes[status]}`}
    >
      {status.toLowerCase()}
    </span>
  );
}

function canRetry(status: PosOfflineSyncStatus) {
  return status === "CONFLICT" || status === "FAILED";
}

function payloadSummary(attempt: PosOfflineSyncAttempt) {
  const payload = attempt.payload;

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const data = payload as {
    paymentMethod?: string;
    customerType?: string;
    items?: Array<{ quantity?: string; productId?: string }>;
    amountPaid?: string;
    soldAt?: string;
  };

  return (
    <div className="grid gap-2 rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] p-3 text-sm">
      <p>
        <span className="font-semibold text-[var(--text-primary)]">
          Customer:
        </span>{" "}
        {data.customerType ?? "-"}
      </p>
      <p>
        <span className="font-semibold text-[var(--text-primary)]">
          Payment:
        </span>{" "}
        {data.paymentMethod ?? "-"}
      </p>
      <p>
        <span className="font-semibold text-[var(--text-primary)]">
          Items:
        </span>{" "}
        {data.items?.length ?? 0}
      </p>
      <p>
        <span className="font-semibold text-[var(--text-primary)]">
          Sold at:
        </span>{" "}
        {formatDate(data.soldAt ?? null)}
      </p>
    </div>
  );
}

function SyncDetailsModal({ attempt }: { attempt: PosOfflineSyncAttempt }) {
  return (
    <AdminModal
      description="Inspect the original offline sale payload and server reconciliation state."
      title="Offline sync details"
      triggerClassName={secondaryButtonClass}
      triggerIcon={null}
      triggerLabel="Details"
      widthClassName="max-w-4xl"
    >
      <div className="grid gap-5">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Terminal
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {attempt.terminal.name ?? "Unnamed terminal"}
            </p>
          </div>
          <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Status
            </p>
            <div className="mt-1">{statusBadge(attempt.status)}</div>
          </div>
          <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Attempted
            </p>
            <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
              {formatDate(attempt.attemptedAt)}
            </p>
          </div>
        </section>

        {attempt.errorMessage ? (
          <div className="rounded-[5px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <p className="font-semibold">Sync issue</p>
            <p className="mt-1">{attempt.errorMessage}</p>
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
          {payloadSummary(attempt)}
          <div className="min-w-0 rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-muted)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              Client request ID
            </p>
            <code className="mt-2 block break-all rounded-[5px] border border-[color:var(--border-muted)] bg-white p-2 text-xs text-[var(--text-secondary)]">
              {attempt.clientRequestId}
            </code>
          </div>
        </section>

        {attempt.sale ? (
          <section className="rounded-[5px] border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-semibold">
              Synced as sale #{attempt.sale.saleNumber}
            </p>
            <p className="mt-1">
              {formatMoney(attempt.sale.totalAmount)} ·{" "}
              {formatDate(attempt.sale.soldAt)}
            </p>
          </section>
        ) : null}

        <section>
          <p className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            Raw payload
          </p>
          <pre className="max-h-80 overflow-auto rounded-[5px] border border-[color:var(--border-muted)] bg-stone-950 p-3 text-xs leading-5 text-stone-100">
            {JSON.stringify(attempt.payload, null, 2)}
          </pre>
        </section>
      </div>
    </AdminModal>
  );
}

function RetryAction({ attempt }: { attempt: PosOfflineSyncAttempt }) {
  if (!canRetry(attempt.status)) {
    return <span className="text-sm text-[var(--text-muted)]">-</span>;
  }

  return (
    <InlineActionForm
      action={retryOfflineSyncAttempt}
      buttonClassName={retryButtonClass}
      className="grid gap-1"
      pendingLabel="Retrying"
      submitLabel="Retry"
      successMessage="Retry submitted."
    >
      <input name="id" type="hidden" value={attempt.id} />
    </InlineActionForm>
  );
}

export default async function AdminPosSyncPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [report, terminals] = await Promise.all([
    apiGet<PaginatedResponse<PosOfflineSyncAttempt>>(
      paginatedApiPath("/admin/pos-terminals/offline-sync", params, [
        "q",
        "status",
        "terminalId",
        "from",
        "to",
      ]),
    ),
    apiGet<PosTerminal[]>("/admin/pos-terminals"),
  ]);
  const terminalOptions = terminals.map((terminal) => ({
    label: terminal.name ?? terminal.id,
    value: terminal.id,
  }));
  const activeStatus = firstParam(params, "status");

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
          POS sync ({report.pagination.total.toLocaleString("en")})
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
          Review offline POS sync attempts, inspect conflicts, and retry after
          fixing terminal stock, retailer credit, or product availability.
        </p>
      </div>

      <TableToolbar
        basePath={BASE_PATH}
        dateFilters={[
          { label: "From", name: "from" },
          { label: "To", name: "to" },
        ]}
        searchParams={params}
        searchPlaceholder="Search request ID, terminal, error, or conflict code"
        selectFilters={[
          {
            label: "Status",
            name: "status",
            options: statusOptions,
            value: activeStatus,
          },
          {
            label: "Terminal",
            name: "terminalId",
            options: terminalOptions,
          },
        ]}
      />

      {report.pagination.total === 0 ? (
        <EmptyState>No offline POS sync attempts have been recorded.</EmptyState>
      ) : report.items.length === 0 ? (
        <EmptyState>No sync attempts match the current filters.</EmptyState>
      ) : (
        <>
          <TableShell
            head={
              <>
                <th className="px-3">Terminal</th>
                <th className="px-3">Status</th>
                <th className="px-3">Sale</th>
                <th className="px-3">Issue</th>
                <th className="px-3">Attempted</th>
                <th className="px-3">Actions</th>
              </>
            }
          >
            {report.items.map((attempt) => (
              <tr key={attempt.id}>
                <td className="px-3 py-3 align-top">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {attempt.terminal.name ?? "Unnamed terminal"}
                  </p>
                  <p className="mt-1 max-w-52 truncate text-xs text-[var(--text-muted)]">
                    {attempt.clientRequestId}
                  </p>
                </td>
                <td className="px-3 py-3 align-top">
                  {statusBadge(attempt.status)}
                  {attempt.conflictCode ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      {attempt.conflictCode}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top text-[var(--text-secondary)]">
                  {attempt.sale ? (
                    <>
                      <p className="font-semibold text-[var(--text-primary)]">
                        #{attempt.sale.saleNumber}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatMoney(attempt.sale.totalAmount)}
                      </p>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="max-w-sm px-3 py-3 align-top text-[var(--text-secondary)]">
                  <p className="line-clamp-2">
                    {attempt.errorMessage ?? "No issue recorded."}
                  </p>
                </td>
                <td className="px-3 py-3 align-top text-[var(--text-secondary)]">
                  {formatDate(attempt.attemptedAt)}
                  {attempt.syncedAt ? (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Synced {formatDate(attempt.syncedAt)}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-wrap items-start gap-2">
                    <SyncDetailsModal attempt={attempt} />
                    <RetryAction attempt={attempt} />
                  </div>
                </td>
              </tr>
            ))}
          </TableShell>

          <TablePagination
            basePath={BASE_PATH}
            page={report.pagination.page}
            pageCount={report.pagination.pageCount}
            rangeEnd={report.pagination.rangeEnd}
            rangeStart={report.pagination.rangeStart}
            searchParams={params}
            total={report.pagination.total}
          />
        </>
      )}
    </Card>
  );
}
