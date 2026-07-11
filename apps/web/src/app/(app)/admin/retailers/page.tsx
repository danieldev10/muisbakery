import { AdminFormModal } from "@/components/admin/form-modal";
import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  StatusBadge,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { Retailer } from "@/lib/operations/types";
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
  createRetailer,
  updateRetailer,
} from "./actions";

const secondaryButtonClass =
  "inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-strong)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:text-[var(--brand-burgundy)]";

const statusOptions = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function RetailerFields({ retailer }: { retailer?: Retailer }) {
  return (
    <>
      {retailer ? <input name="id" type="hidden" value={retailer.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          defaultValue={retailer?.name}
          label="Retailer name"
          name="name"
          required
        />
        <Field
          defaultValue={retailer?.contactPerson ?? ""}
          label="Contact person"
          name="contactPerson"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          defaultValue={retailer?.phone ?? ""}
          label="Phone"
          name="phone"
          type="tel"
        />
        <Field
          defaultValue={retailer?.email ?? ""}
          label="Email"
          name="email"
          type="email"
        />
        <Field
          defaultValue={retailer?.creditLimit}
          label="Credit limit"
          min="0.01"
          name="creditLimit"
          required
          step="0.01"
          type="number"
        />
      </div>
      <TextareaField
        defaultValue={retailer?.address ?? ""}
        label="Address"
        name="address"
      />
      <TextareaField
        defaultValue={retailer?.notes ?? ""}
        label="Notes"
        name="notes"
      />
      {retailer ? (
        <SelectField
          defaultValue={retailer.isActive ? "true" : "false"}
          hint="Inactive retailers cannot be selected for new retailer sales, but existing balances can still be settled."
          label="Status"
          name="isActive"
          options={statusOptions}
          required
        />
      ) : null}
    </>
  );
}

export default async function AdminRetailersPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const retailers = await apiGet<Retailer[]>("/admin/retailers");
  const query = firstParam(params, "q");
  const status = firstParam(params, "status");
  const filteredRetailers = retailers.filter(
    (retailer) =>
      matchesSearch(query, [
        retailer.name,
        retailer.contactPerson,
        retailer.phone,
        retailer.email,
        retailer.address,
        retailer.creditLimit,
        retailer.outstandingBalance,
        retailer.availableCredit,
        retailer.notes,
      ]) && matchesSelect(status, retailer.isActive),
  );
  const { pageItems, ...pagination } = paginate(
    filteredRetailers,
    pageNumber(params.page),
  );

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
            Retailers ({filteredRetailers.length} of {retailers.length})
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
            Manage retailer accounts and credit limits for Sales.
          </p>
        </div>
        <AdminFormModal
          action={createRetailer}
          description="Create a retailer account for credit-limit sales."
          submitLabel="Create retailer"
          title="Create retailer"
          triggerLabel="Create retailer"
        >
          <RetailerFields />
        </AdminFormModal>
      </div>

      {retailers.length > 0 ? (
        <TableToolbar
          basePath="/admin/retailers"
          searchParams={params}
          searchPlaceholder="Search retailer, contact, phone, email, or balance"
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

      {retailers.length === 0 ? (
        <EmptyState>No retailer accounts have been created yet.</EmptyState>
      ) : filteredRetailers.length === 0 ? (
        <EmptyState>No retailers match the current filters.</EmptyState>
      ) : (
        <TableShell
          head={
            <>
              <th className="py-2 pr-4">Retailer</th>
              <th className="py-2 pr-4">Contact</th>
              <th className="py-2 pr-4">Credit limit</th>
              <th className="py-2 pr-4">Outstanding</th>
              <th className="py-2 pr-4">Available</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Actions</th>
            </>
          }
        >
          {pageItems.map((retailer) => (
            <tr className="align-top" key={retailer.id}>
              <td className="py-3 pr-4">
                <p className="font-medium text-stone-900">{retailer.name}</p>
                {retailer.address ? (
                  <p className="text-xs text-stone-500">{retailer.address}</p>
                ) : null}
              </td>
              <td className="py-3 pr-4 text-stone-600">
                <p>{retailer.contactPerson ?? "-"}</p>
                <p className="text-xs">
                  {[retailer.phone, retailer.email].filter(Boolean).join(" · ") ||
                    "-"}
                </p>
              </td>
              <td className="py-3 pr-4 text-stone-600">
                {formatMoney(retailer.creditLimit)}
              </td>
              <td className="py-3 pr-4 text-red-800">
                {formatMoney(retailer.outstandingBalance)}
              </td>
              <td className="py-3 pr-4 font-semibold text-emerald-700">
                {formatMoney(retailer.availableCredit)}
              </td>
              <td className="py-3 pr-4">
                <StatusBadge active={retailer.isActive} />
              </td>
              <td className="py-3 pr-4">
                <div className="flex flex-wrap items-start gap-2">
                  <AdminFormModal
                    action={updateRetailer}
                    description={retailer.name}
                    submitLabel="Save changes"
                    title="Edit retailer"
                    triggerClassName={secondaryButtonClass}
                    triggerIcon={null}
                    triggerLabel="Edit"
                  >
                    <RetailerFields retailer={retailer} />
                  </AdminFormModal>
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      )}

      <TablePagination
        basePath="/admin/retailers"
        searchParams={params}
        {...pagination}
      />
    </Card>
  );
}
