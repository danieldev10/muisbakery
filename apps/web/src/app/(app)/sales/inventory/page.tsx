import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import type { SalesInventoryItem } from "@/lib/operations/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import { firstParam, matchesSearch } from "@/lib/table-filters";

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

export default async function SalesInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const inventory = await apiGet<SalesInventoryItem[]>("/sales/inventory");
  const stockedItems = inventory.filter((item) => item.batches.length > 0);
  const query = firstParam(params, "q");
  const filteredItems = stockedItems.filter((item) =>
    matchesSearch(query, [
      formatProductName(item.product),
      item.product.unit.name,
      item.product.unit.abbreviation,
      item.totalRemaining,
      item.product.unitPrice,
      ...item.batches.flatMap((batch) => [
        batch.batchNumber,
        batch.batchDate,
        batch.quantityReceived,
        batch.quantityRemaining,
        batch.productionRun?.producedAt,
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
        title="Sales inventory"
        description="Finished goods received from Production and available for sale."
      />

      <Card title={`Finished goods stock (${filteredItems.length} of ${stockedItems.length})`}>
        {stockedItems.length > 0 ? (
          <TableToolbar
            basePath="/sales/inventory"
            searchParams={params}
            searchPlaceholder="Search product, unit, batch, production run, or user"
          />
        ) : null}
        {stockedItems.length === 0 ? (
          <EmptyState>No finished goods have been sent to Sales yet.</EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState>No Sales inventory matches the current filters.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {pageItems.map((item) => (
              <section
                className="rounded-md border border-stone-200 p-4"
                key={item.product.id}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-semibold text-stone-950">
                      {formatProductName(item.product)}
                    </h2>
                    <p className="text-xs text-stone-500">
                      Available stock received from Production.
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-red-800">
                    {formatQuantity(
                      item.totalRemaining,
                      item.product.unit.abbreviation,
                    )}
                  </p>
                </div>

                <div className="mt-4">
                  <TableShell
                    head={
                      <>
                        <th className="py-2 pr-4">Batch</th>
                        <th className="py-2 pr-4">Received</th>
                        <th className="py-2 pr-4">Quantity</th>
                        <th className="py-2 pr-4">Remaining</th>
                        <th className="py-2 pr-4">Production run</th>
                      </>
                    }
                  >
                    {item.batches.map((batch) => (
                      <tr className="align-top" key={batch.id}>
                        <td className="py-3 pr-4 font-medium text-stone-900">
                          Batch {batch.batchNumber}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatDate(batch.receivedAt)}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatQuantity(
                            batch.quantityReceived,
                            item.product.unit.abbreviation,
                          )}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatQuantity(
                            batch.quantityRemaining,
                            item.product.unit.abbreviation,
                          )}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {batch.productionRun
                            ? formatDate(batch.productionRun.producedAt)
                            : "-"}
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
          basePath="/sales/inventory"
          searchParams={params}
          {...pagination}
        />
      </Card>
    </>
  );
}
