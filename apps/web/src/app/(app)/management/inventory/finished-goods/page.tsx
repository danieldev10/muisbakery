import { Card, EmptyState, TableShell } from "@/components/admin/layout";
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
import { firstParam, matchesSearch } from "@/lib/table-filters";

import {
  formatMoney,
  formatQuantity,
  ManagementPageShell,
  MetricCard,
} from "../../_components";

const basePath = "/management/inventory/finished-goods";

export default async function ManagementFinishedGoodsPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const report = await apiGet<ManagementInventoryReport>("/management/inventory");
  const stockedProducts = report.finishedProducts.filter(
    (item) => item.batches.length > 0,
  );
  const query = firstParam(params, "q");
  const filteredItems = stockedProducts.filter((item) =>
    matchesSearch(query, [
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
  const { pageItems, ...pagination } = paginate(
    filteredItems,
    pageNumber(params.page),
  );
  const reportSections = [
    {
      title: "Finished goods valuation",
      rows: [
        {
          "Cost value": formatMoney(report.valuation.finishedGoodsCost),
          "Retail value": formatMoney(report.valuation.finishedGoodsRetail),
          "Stocked products": stockedProducts.length,
        },
      ],
    },
    {
      title: "Finished goods",
      rows: filteredItems.map((item) => ({
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
  ];

  return (
    <ManagementPageShell>
      <div className="flex justify-end">
        <ReportExportActions
          filename="management-finished-goods"
          sections={reportSections}
          title="Management finished goods report"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Cost value"
          value={formatMoney(report.valuation.finishedGoodsCost)}
        />
        <MetricCard
          label="Retail value"
          value={formatMoney(report.valuation.finishedGoodsRetail)}
        />
        <MetricCard label="Stocked products" value={stockedProducts.length} />
      </div>

      <Card
        title={`Finished goods (${filteredItems.length} of ${stockedProducts.length})`}
      >
        {stockedProducts.length > 0 ? (
          <TableToolbar
            basePath={basePath}
            searchParams={params}
            searchPlaceholder="Search product, unit, price, batch, cost, or value"
          />
        ) : null}
        {stockedProducts.length === 0 ? (
          <EmptyState>No finished products currently have stock.</EmptyState>
        ) : filteredItems.length === 0 ? (
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
            {pageItems.map((item) => (
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
          basePath={basePath}
          searchParams={params}
          {...pagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
