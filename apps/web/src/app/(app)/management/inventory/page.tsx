import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import type { ManagementInventoryReport } from "@/lib/management/types";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

import { formatDate, formatMoney, formatQuantity, MetricCard } from "../_components";
import { updateRawMaterialUnitCost } from "./actions";

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

      <Card title="Managed raw material costs">
        {report.rawMaterials.length === 0 ? (
          <EmptyState>No raw materials have been created yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Material</th>
                <th className="py-2 pr-4">Base unit</th>
                <th className="py-2 pr-4">Current unit cost</th>
                <th className="py-2 pr-4">Update</th>
              </>
            }
          >
            {report.rawMaterials.map((item) => (
              <tr className="align-top" key={item.rawMaterial.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {item.rawMaterial.name}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {item.rawMaterial.baseUnit.abbreviation}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {item.rawMaterial.unitCost
                    ? formatMoney(item.rawMaterial.unitCost)
                    : "-"}
                </td>
                <td className="py-3 pr-4">
                  <InlineActionForm
                    action={updateRawMaterialUnitCost}
                    className="grid gap-1 sm:grid-cols-[8rem_auto] sm:items-start"
                    submitLabel="Save"
                    successMessage="Saved."
                  >
                    <input name="id" type="hidden" value={item.rawMaterial.id} />
                    <label
                      className="sr-only"
                      htmlFor={`unitCost-${item.rawMaterial.id}`}
                    >
                      Unit cost for {item.rawMaterial.name}
                    </label>
                    <input
                      className="h-9 w-32 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
                      defaultValue={item.rawMaterial.unitCost ?? ""}
                      id={`unitCost-${item.rawMaterial.id}`}
                      min="0"
                      name="unitCost"
                      placeholder="0.00"
                      required
                      step="0.01"
                      type="number"
                    />
                  </InlineActionForm>
                </td>
              </tr>
            ))}
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
                  {formatProductName(item.product)}
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
