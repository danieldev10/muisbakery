import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { ManagementInventoryReport } from "@/lib/management/types";
import { apiGet } from "@/lib/server-api";

import { formatDate, formatMoney, formatQuantity, MetricCard } from "../_components";

export default async function ManagementInventoryPage() {
  const report = await apiGet<ManagementInventoryReport>("/management/inventory");
  const stockedRawMaterials = report.rawMaterials.filter(
    (item) => item.batches.length > 0,
  );
  const stockedFinishedProducts = report.finishedProducts.filter(
    (item) => item.batches.length > 0,
  );

  return (
    <>
      <PageHeader
        title="Inventory valuation"
        description="Current raw material and finished product stock values."
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Raw materials"
          value={formatMoney(report.valuation.rawMaterials)}
          detail={`${stockedRawMaterials.length} stocked items`}
        />
        <MetricCard
          label="Finished goods"
          value={formatMoney(report.valuation.finishedGoods)}
          detail={`${stockedFinishedProducts.length} stocked products`}
        />
        <MetricCard
          label="Total stock value"
          value={formatMoney(report.valuation.totalStockValue)}
          detail={`Low stock threshold ${formatQuantity(report.lowStockThreshold)}`}
        />
      </div>

      <Card title="Raw material stock">
        {stockedRawMaterials.length === 0 ? (
          <EmptyState>No raw materials currently have stock.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Material</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Value</th>
                <th className="py-2 pr-4">Earliest batch</th>
              </>
            }
          >
            {stockedRawMaterials.map((item) => {
              const firstBatch = item.batches[0];

              return (
                <tr className="align-top" key={item.rawMaterial.id}>
                  <td className="py-3 pr-4 font-medium text-stone-900">
                    {item.rawMaterial.name}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatQuantity(
                      item.totalRemaining,
                      item.rawMaterial.baseUnit.abbreviation,
                    )}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    {formatMoney(item.estimatedValue)}
                  </td>
                  <td className="py-3 pr-4 text-stone-600">
                    Batch {firstBatch.batchNumber} from{" "}
                    {formatDate(firstBatch.batchDate)}
                  </td>
                </tr>
              );
            })}
          </TableShell>
        )}
      </Card>

      <Card title="Raw material batches">
        {stockedRawMaterials.length === 0 ? (
          <EmptyState>No raw material batches to show.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {stockedRawMaterials.map((item) => (
              <section
                className="rounded-md border border-stone-200 p-4"
                key={item.rawMaterial.id}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <h2 className="font-semibold text-stone-950">
                    {item.rawMaterial.name}
                  </h2>
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
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Remaining</th>
                        <th className="py-2 pr-4">Unit cost</th>
                        <th className="py-2 pr-4">Value</th>
                      </>
                    }
                  >
                    {item.batches.map((batch) => (
                      <tr key={batch.id}>
                        <td className="py-3 pr-4 font-medium text-stone-900">
                          Batch {batch.batchNumber}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatDate(batch.batchDate)}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatQuantity(
                            batch.quantityRemaining,
                            item.rawMaterial.baseUnit.abbreviation,
                          )}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {batch.unitCost ? formatMoney(batch.unitCost) : "-"}
                        </td>
                        <td className="py-3 pr-4 text-stone-600">
                          {formatMoney(batch.estimatedValue)}
                        </td>
                      </tr>
                    ))}
                  </TableShell>
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <Card title="Finished goods">
        {stockedFinishedProducts.length === 0 ? (
          <EmptyState>No finished products currently have stock.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Retail value</th>
                <th className="py-2 pr-4">Batches</th>
              </>
            }
          >
            {stockedFinishedProducts.map((item) => (
              <tr key={item.product.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {item.product.name}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    item.totalRemaining,
                    item.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(item.estimatedRetailValue)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {item.batches.length}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
