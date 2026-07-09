import {
  Card,
  EmptyState,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { RawMaterialReceipt, StoreOptions } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

import { receiveRawMaterial } from "./actions";
import { ReceiveMaterialModal } from "./receive-material-modal";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export default async function StoreReceivingPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const [options, receipts] = await Promise.all([
    apiGet<StoreOptions>("/store/options"),
    apiGet<RawMaterialReceipt[]>("/store/receipts"),
  ]);
  const { pageItems, ...pagination } = paginate(
    receipts,
    pageNumber(params.page),
  );

  const materialOptions = options.rawMaterials.map((material) => ({
    value: material.id,
    label: `${material.name} (${material.baseUnit.abbreviation})`,
  }));
  const supplierOptions = options.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
  }));

  return (
    <Card>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold leading-tight text-[var(--text-primary)]">
          Recent receipts ({receipts.length})
        </h2>
        <ReceiveMaterialModal
          action={receiveRawMaterial}
          materialOptions={materialOptions}
          supplierOptions={supplierOptions}
        />
      </div>

      <div>
        {receipts.length === 0 ? (
          <EmptyState>No receipts yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Material</th>
                <th className="py-2 pr-4">Received</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Supplier</th>
              </>
            }
          >
            {pageItems.map((receipt) => (
              <tr className="align-top" key={receipt.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  Batch {receipt.batch.batchNumber}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {receipt.rawMaterial.name}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(receipt.receivedAt)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    receipt.quantity,
                    receipt.rawMaterial.baseUnit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {receipt.supplier?.name ?? "-"}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath="/store/receiving"
          searchParams={params}
          {...pagination}
        />
      </div>
    </Card>
  );
}
