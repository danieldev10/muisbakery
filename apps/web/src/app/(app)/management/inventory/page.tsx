import { Card, EmptyState, TableShell } from "@/components/admin/layout";
import { InlineActionForm } from "@/components/admin/inline-action-form";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementInventoryReport } from "@/lib/management/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";
import {
  firstParam,
  matchesDateRange,
  matchesSearch,
  matchesSelect,
} from "@/lib/table-filters";

import {
  formatDate,
  formatMoney,
  formatQuantity,
  ManagementPageShell,
  MetricCard,
} from "../_components";
import { updateRawMaterialUnitCost } from "./actions";

export default async function ManagementInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const report = await apiGet<ManagementInventoryReport>("/management/inventory");
  const stockedRawMaterials = report.rawMaterials.filter(
    (item) => item.batches.length > 0,
  );
  const stockedFinishedProducts = report.finishedProducts.filter(
    (item) => item.batches.length > 0,
  );
  const stockQuery = firstParam(params, "stockQ");
  const filteredStockedRawMaterials = stockedRawMaterials.filter((item) =>
    matchesSearch(stockQuery, [
      item.rawMaterial.name,
      item.rawMaterial.baseUnit.name,
      item.rawMaterial.baseUnit.abbreviation,
      item.totalRemaining,
      item.estimatedValue,
      ...item.batches.flatMap((batch) => [
        batch.batchNumber,
        batch.batchLabel,
        batch.supplier?.name,
        batch.quantityRemaining,
        batch.estimatedValue,
      ]),
    ]),
  );
  const costQuery = firstParam(params, "costQ");
  const costStatus = firstParam(params, "costStatus");
  const filteredCostMaterials = report.rawMaterials.filter(
    (item) =>
      matchesSearch(costQuery, [
        item.rawMaterial.name,
        item.rawMaterial.baseUnit.name,
        item.rawMaterial.baseUnit.abbreviation,
        item.rawMaterial.unitCost,
      ]) &&
      matchesSelect(
        costStatus,
        item.rawMaterial.unitCost ? "set" : "missing",
      ),
  );
  const batchQuery = firstParam(params, "batchQ");
  const batchSupplier = firstParam(params, "batchSupplier");
  const batchFrom = firstParam(params, "batchFrom");
  const batchTo = firstParam(params, "batchTo");
  const batchSupplierOptions = [
    ...new Map(
      stockedRawMaterials.flatMap((item) =>
        item.batches
          .filter((batch) => batch.supplier)
          .map((batch) => [
            batch.supplier!.id,
            { label: batch.supplier!.name, value: batch.supplier!.id },
          ]),
      ),
    ).values(),
  ];
  const filteredBatchMaterials = stockedRawMaterials.filter((item) =>
    item.batches.some(
      (batch) =>
        matchesSearch(batchQuery, [
          item.rawMaterial.name,
          item.rawMaterial.baseUnit.abbreviation,
          batch.batchNumber,
          batch.batchLabel,
          batch.supplier?.name,
          batch.quantityRemaining,
          batch.unitCost,
          batch.estimatedValue,
        ]) &&
        matchesSelect(batchSupplier, batch.supplier?.id ?? "") &&
        matchesDateRange(batch.receivedAt, batchFrom, batchTo),
    ),
  );
  const productQuery = firstParam(params, "productQ");
  const filteredFinishedProducts = stockedFinishedProducts.filter((item) =>
    matchesSearch(productQuery, [
      formatProductName(item.product),
      item.product.unit.name,
      item.product.unit.abbreviation,
      item.product.unitPrice,
      item.totalRemaining,
      item.estimatedCostValue,
      item.estimatedRetailValue,
      ...item.batches.flatMap((batch) => [
        batch.batchNumber,
        batch.batchDate,
        batch.quantityRemaining,
        batch.unitCost,
        batch.estimatedCostValue,
        batch.estimatedRetailValue,
        batch.productionRun?.producedAt,
      ]),
    ]),
  );
  const { pageItems: stockItems, ...stockPagination } = paginate(
    filteredStockedRawMaterials,
    pageNumber(params.stockPage),
  );
  const { pageItems: costItems, ...costsPagination } = paginate(
    filteredCostMaterials,
    pageNumber(params.costsPage),
  );
  const { pageItems: batchItems, ...batchesPagination } = paginate(
    filteredBatchMaterials,
    pageNumber(params.batchesPage),
    5,
  );
  const { pageItems: productItems, ...productsPagination } = paginate(
    filteredFinishedProducts,
    pageNumber(params.productsPage),
  );
  const reportSections = [
    {
      title: "Valuation",
      rows: [
        {
          "Raw materials": formatMoney(report.valuation.rawMaterials),
          "Finished goods": formatMoney(report.valuation.finishedGoods),
          "Finished goods cost": formatMoney(report.valuation.finishedGoodsCost),
          "Finished goods retail": formatMoney(
            report.valuation.finishedGoodsRetail,
          ),
          "Total stock value": formatMoney(report.valuation.totalStockValue),
          "Total retail value": formatMoney(report.valuation.totalRetailValue),
        },
      ],
    },
    {
      title: "Raw material stock",
      rows: filteredStockedRawMaterials.map((item) => ({
        Material: item.rawMaterial.name,
        Remaining: formatQuantity(
          item.totalRemaining,
          item.rawMaterial.baseUnit.abbreviation,
        ),
        Value: formatMoney(item.estimatedValue),
        Batches: item.batches.length,
      })),
    },
    {
      title: "Raw material batches",
      rows: filteredBatchMaterials.flatMap((item) =>
        item.batches
          .filter(
            (batch) =>
              matchesSearch(batchQuery, [
                item.rawMaterial.name,
                item.rawMaterial.baseUnit.abbreviation,
                batch.batchNumber,
                batch.batchLabel,
                batch.supplier?.name,
                batch.quantityRemaining,
                batch.unitCost,
                batch.estimatedValue,
              ]) &&
              matchesSelect(batchSupplier, batch.supplier?.id ?? "") &&
              matchesDateRange(batch.receivedAt, batchFrom, batchTo),
          )
          .map((batch) => ({
            Material: item.rawMaterial.name,
            Batch: batch.batchLabel,
            Supplier: batch.supplier?.name ?? "",
            Remaining: formatQuantity(
              batch.quantityRemaining,
              item.rawMaterial.baseUnit.abbreviation,
            ),
            "Unit cost": batch.unitCost ? formatMoney(batch.unitCost) : "",
            Value: formatMoney(batch.estimatedValue),
            "Received at": formatDate(batch.receivedAt),
          })),
      ),
    },
    {
      title: "Finished goods",
      rows: filteredFinishedProducts.map((item) => ({
        Product: formatProductName(item.product),
        Remaining: formatQuantity(
          item.totalRemaining,
          item.product.unit.abbreviation,
        ),
        "Cost value": formatMoney(item.estimatedCostValue),
        "Retail value": formatMoney(item.estimatedRetailValue),
        Batches: item.batches.length,
      })),
    },
    {
      title: "Managed raw material costs",
      rows: filteredCostMaterials.map((item) => ({
        Material: item.rawMaterial.name,
        "Base unit": item.rawMaterial.baseUnit.abbreviation,
        "Current unit cost": item.rawMaterial.unitCost
          ? formatMoney(item.rawMaterial.unitCost)
          : "",
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <div className="flex justify-end">
        <ReportExportActions
          filename="management-inventory"
          sections={reportSections}
          title="Management inventory report"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Raw materials"
          value={formatMoney(report.valuation.rawMaterials)}
          detail={`${stockedRawMaterials.length} stocked items`}
        />
        <MetricCard
          label="Finished goods"
          value={formatMoney(report.valuation.finishedGoods)}
          detail={`${stockedFinishedProducts.length} stocked products at cost`}
        />
        <MetricCard
          label="Total stock value"
          value={formatMoney(report.valuation.totalStockValue)}
          detail={`Retail reference ${formatMoney(report.valuation.totalRetailValue)}`}
        />
      </div>

      <Card title={`Raw material stock (${filteredStockedRawMaterials.length} of ${stockedRawMaterials.length})`}>
        {stockedRawMaterials.length > 0 ? (
          <TableToolbar
            basePath="/management/inventory"
            pageParams={["stockPage"]}
            searchParam="stockQ"
            searchParams={params}
            searchPlaceholder="Search material, unit, batch, supplier, or value"
          />
        ) : null}
        {stockedRawMaterials.length === 0 ? (
          <EmptyState>No raw materials currently have stock.</EmptyState>
        ) : filteredStockedRawMaterials.length === 0 ? (
          <EmptyState>No raw material stock matches the current filters.</EmptyState>
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
            {stockItems.map((item) => {
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
        <TablePagination
          basePath="/management/inventory"
          pageParam="stockPage"
          searchParams={params}
          {...stockPagination}
        />
      </Card>

      <Card title={`Managed raw material costs (${filteredCostMaterials.length} of ${report.rawMaterials.length})`}>
        {report.rawMaterials.length > 0 ? (
          <TableToolbar
            basePath="/management/inventory"
            pageParams={["costsPage"]}
            searchParam="costQ"
            searchParams={params}
            searchPlaceholder="Search material, unit, or cost"
            selectFilters={[
              {
                label: "Cost",
                name: "costStatus",
                options: [
                  { label: "Cost set", value: "set" },
                  { label: "Missing cost", value: "missing" },
                ],
              },
            ]}
          />
        ) : null}
        {report.rawMaterials.length === 0 ? (
          <EmptyState>No raw materials have been created yet.</EmptyState>
        ) : filteredCostMaterials.length === 0 ? (
          <EmptyState>No raw material costs match the current filters.</EmptyState>
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
            {costItems.map((item) => (
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
        <TablePagination
          basePath="/management/inventory"
          pageParam="costsPage"
          searchParams={params}
          {...costsPagination}
        />
      </Card>

      <Card title={`Raw material batches (${filteredBatchMaterials.length} of ${stockedRawMaterials.length})`}>
        {stockedRawMaterials.length > 0 ? (
          <TableToolbar
            basePath="/management/inventory"
            dateFilters={[
              { label: "Received from", name: "batchFrom" },
              { label: "Received to", name: "batchTo" },
            ]}
            pageParams={["batchesPage"]}
            searchParam="batchQ"
            searchParams={params}
            searchPlaceholder="Search material, batch, supplier, cost, or value"
            selectFilters={[
              {
                label: "Supplier",
                name: "batchSupplier",
                options: batchSupplierOptions,
              },
            ]}
          />
        ) : null}
        {stockedRawMaterials.length === 0 ? (
          <EmptyState>No raw material batches to show.</EmptyState>
        ) : filteredBatchMaterials.length === 0 ? (
          <EmptyState>No raw material batches match the current filters.</EmptyState>
        ) : (
          <div className="grid gap-4">
            {batchItems.map((item) => (
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
                    {item.batches
                      .filter(
                        (batch) =>
                          matchesSearch(batchQuery, [
                            item.rawMaterial.name,
                            item.rawMaterial.baseUnit.abbreviation,
                            batch.batchNumber,
                            batch.batchLabel,
                            batch.supplier?.name,
                            batch.quantityRemaining,
                            batch.unitCost,
                            batch.estimatedValue,
                          ]) &&
                          matchesSelect(batchSupplier, batch.supplier?.id ?? "") &&
                          matchesDateRange(batch.receivedAt, batchFrom, batchTo),
                      )
                      .map((batch) => (
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
        <TablePagination
          basePath="/management/inventory"
          pageParam="batchesPage"
          searchParams={params}
          {...batchesPagination}
        />
      </Card>

      <Card title={`Finished goods (${filteredFinishedProducts.length} of ${stockedFinishedProducts.length})`}>
        {stockedFinishedProducts.length > 0 ? (
          <TableToolbar
            basePath="/management/inventory"
            pageParams={["productsPage"]}
            searchParam="productQ"
            searchParams={params}
            searchPlaceholder="Search product, unit, price, batch, cost, or value"
          />
        ) : null}
        {stockedFinishedProducts.length === 0 ? (
          <EmptyState>No finished products currently have stock.</EmptyState>
        ) : filteredFinishedProducts.length === 0 ? (
          <EmptyState>No finished goods match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Cost value</th>
                <th className="py-2 pr-4">Retail value</th>
                <th className="py-2 pr-4">Batches</th>
              </>
            }
          >
            {productItems.map((item) => (
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
                  {formatMoney(item.estimatedCostValue)}
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
        <TablePagination
          basePath="/management/inventory"
          pageParam="productsPage"
          searchParams={params}
          {...productsPagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
