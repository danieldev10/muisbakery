import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { ProductionMaterialInventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import { firstParam, matchesSearch } from "@/lib/table-filters";

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

export default async function ProductionInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const inventory = await apiGet<ProductionMaterialInventoryItem[]>(
    "/production/inventory",
  );
  const stockedItems = inventory.filter((item) => item.batches.length > 0);
  const query = firstParam(params, "q");
  const filteredItems = stockedItems.filter((item) =>
    matchesSearch(query, [
      item.rawMaterial.name,
      item.rawMaterial.baseUnit.name,
      item.rawMaterial.baseUnit.abbreviation,
      item.totalRemaining,
      ...item.batches.flatMap((batch) => [
        batch.quantityReceived,
        batch.quantityRemaining,
        batch.storeBatch?.batchNumber,
        batch.storeBatch?.batchDate,
        batch.createdBy?.name,
        batch.createdBy?.email,
      ]),
    ]),
  );
  const { pageItems, ...pagination } = paginate(
    filteredItems,
    pageNumber(params.page),
    5,
  );

  return (
    <>
      <PageHeader
        title="Production inventory"
        description="Raw materials issued from Store and still available for production."
      />

      <Card title={`Raw materials in Production (${filteredItems.length} of ${stockedItems.length})`}>
        {stockedItems.length > 0 ? (
          <TableToolbar
            basePath="/production/inventory"
            searchParams={params}
            searchPlaceholder="Search material, unit, Store batch, or user"
          />
        ) : null}
        {stockedItems.length === 0 ? (
          <EmptyState>No issued raw materials are available in Production.</EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState>No Production inventory matches the current filters.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {pageItems.map((item) => (
              <section
                className="rounded-md border border-stone-200 p-4"
                key={item.rawMaterial.id}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-stone-950">
                      {item.rawMaterial.name}
                    </h2>
                    <p className="text-xs text-stone-500">
                      Available after Store issues and Production consumption.
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-red-800">
                    {formatQuantity(
                      item.totalRemaining,
                      item.rawMaterial.baseUnit.abbreviation,
                    )}
                  </p>
                </div>

                <div className="mt-4">
                  <TableShell
                    head={
                      <>
                        <th className="py-2 pr-4">Received</th>
                        <th className="py-2 pr-4">Store batch</th>
                        <th className="py-2 pr-4">Received qty</th>
                        <th className="py-2 pr-4">Remaining</th>
                      </>
                    }
                  >
                    {item.batches.map((batch) => (
                      <tr className="align-top" key={batch.id}>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatDate(batch.receivedAt)}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {batch.storeBatch
                            ? `Batch ${batch.storeBatch.batchNumber}`
                            : "-"}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatQuantity(
                            batch.quantityReceived,
                            item.rawMaterial.baseUnit.abbreviation,
                          )}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatQuantity(
                            batch.quantityRemaining,
                            item.rawMaterial.baseUnit.abbreviation,
                          )}
                        </td>
                      </tr>
                    ))}
                  </TableShell>
                </div>
              </section>
            ))}
          </div>
        )}
        <TablePagination
          basePath="/production/inventory"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
