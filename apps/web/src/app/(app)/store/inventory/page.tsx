import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import type { InventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatQuantity(value: string, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export default async function StoreInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const inventory = await apiGet<InventoryItem[]>("/store/inventory");
  const stockedItems = inventory.filter((item) => item.batches.length > 0);
  const { pageItems, ...pagination } = paginate(
    stockedItems,
    pageNumber(params.page),
    5,
  );

  return (
    <>
      <PageHeader
        title="Store inventory"
        description="Current raw material stock by material and FIFO batch."
      />

      <Card title={`Raw material stock (${stockedItems.length})`}>
        {stockedItems.length === 0 ? (
          <EmptyState>No raw material batches have stock yet.</EmptyState>
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
                      Earliest batch should be issued first.
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
                        <th className="py-2 pr-4">Batch</th>
                        <th className="py-2 pr-4">Batch date</th>
                        <th className="py-2 pr-4">Received</th>
                        <th className="py-2 pr-4">Remaining</th>
                      </>
                    }
                  >
                    {item.batches.map((batch) => (
                      <tr className="align-top" key={batch.id}>
                        <td className="py-3 pr-4 font-medium text-stone-900">
                          Batch {batch.batchNumber}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatDate(batch.batchDate)}
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
          basePath="/store/inventory"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
