import { ArrowRight, Layers3, PackageOpen } from "lucide-react";
import Link from "next/link";

import { Card, EmptyState } from "@/components/admin/layout";
import { TablePagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { ReportExportActions } from "@/components/reports/report-export-actions";
import type { ManagementInventoryReport } from "@/lib/management/types";
import {
  pageNumber,
  paginate,
  type PageSearchParams,
} from "@/lib/paginate";
import { apiGet } from "@/lib/server-api";
import { firstParam, matchesSearch } from "@/lib/table-filters";

import {
  formatDate,
  formatMoney,
  formatQuantity,
  ManagementPageShell,
  MetricCard,
} from "../../_components";
import { EditUnitPriceModal } from "./edit-unit-price-modal";

const basePath = "/management/inventory/raw-materials";

export default async function ManagementRawMaterialInventoryPage({
  searchParams,
}: {
  searchParams: Promise<PageSearchParams>;
}) {
  const params = await searchParams;
  const report = await apiGet<ManagementInventoryReport>("/management/inventory");
  const query = firstParam(params, "q");
  const filteredItems = report.rawMaterials.filter((item) =>
    matchesSearch(query, [
      item.rawMaterial.name,
      item.rawMaterial.baseUnit.name,
      item.rawMaterial.baseUnit.abbreviation,
      item.rawMaterial.unitCost,
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
  const { pageItems, ...pagination } = paginate(
    filteredItems,
    pageNumber(params.page),
    12,
  );
  const stockedRawMaterials = report.rawMaterials.filter(
    (item) => item.batches.length > 0,
  );
  const stockedFinishedProducts = report.finishedProducts.filter(
    (item) => item.batches.length > 0,
  );
  const reportSections = [
    {
      title: "Valuation",
      rows: [
        {
          "Raw materials": formatMoney(report.valuation.rawMaterials),
          "Finished goods": formatMoney(report.valuation.finishedGoods),
          "Total stock value": formatMoney(report.valuation.totalStockValue),
          "Total retail value": formatMoney(report.valuation.totalRetailValue),
        },
      ],
    },
    {
      title: "Raw materials",
      rows: filteredItems.map((item) => ({
        Material: item.rawMaterial.name,
        "Unit price": item.rawMaterial.unitCost
          ? formatMoney(item.rawMaterial.unitCost)
          : "Not set",
        Remaining: formatQuantity(
          item.totalRemaining,
          item.rawMaterial.baseUnit.abbreviation,
        ),
        Value: formatMoney(item.estimatedValue),
        Batches: item.batches.length,
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <div className="flex justify-end">
        <ReportExportActions
          filename="management-raw-material-stock"
          sections={reportSections}
          title="Management raw material stock report"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          detail={`${stockedRawMaterials.length} of ${report.rawMaterials.length} materials stocked`}
          label="Raw materials"
          value={formatMoney(report.valuation.rawMaterials)}
        />
        <MetricCard
          detail={`${stockedFinishedProducts.length} stocked products at cost`}
          label="Finished goods"
          value={formatMoney(report.valuation.finishedGoods)}
        />
        <MetricCard
          detail={`Retail reference ${formatMoney(report.valuation.totalRetailValue)}`}
          label="Total stock value"
          value={formatMoney(report.valuation.totalStockValue)}
        />
      </div>

      <Card
        title={`Raw materials (${filteredItems.length} of ${report.rawMaterials.length})`}
      >
        {report.rawMaterials.length > 0 ? (
          <TableToolbar
            basePath={basePath}
            searchParams={params}
            searchPlaceholder="Search material, unit, price, batch, supplier, or value"
          />
        ) : null}
        {report.rawMaterials.length === 0 ? (
          <EmptyState>No raw materials have been created yet.</EmptyState>
        ) : filteredItems.length === 0 ? (
          <EmptyState>No raw materials match the current filters.</EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((item) => {
              const unit = item.rawMaterial.baseUnit.abbreviation;
              const earliestBatch = item.batches[0];
              const latestBatch = item.batches[item.batches.length - 1];
              const detailHref = `${basePath}/${item.rawMaterial.id}`;

              return (
                <article
                  className="group flex min-h-64 flex-col rounded-lg border border-[color:var(--border-muted)] bg-white shadow-[var(--shadow-whisper)] transition hover:-translate-y-0.5 hover:border-[var(--brand-burgundy)] hover:shadow-[var(--shadow-panel)]"
                  key={item.rawMaterial.id}
                >
                  <Link
                    className="flex flex-1 flex-col p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-burgundy)]"
                    href={detailHref}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="mt-1 text-lg font-semibold leading-tight text-[var(--text-primary)]">
                        {item.rawMaterial.name}
                      </h2>
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] text-[var(--brand-burgundy)] transition group-hover:border-[var(--brand-burgundy)] group-hover:bg-[var(--brand-tint)]">
                        <PackageOpen aria-hidden className="size-5" />
                      </span>
                    </div>

                    <div className="mt-6">
                      <p className="text-2xl font-semibold text-[var(--brand-burgundy)]">
                        {formatQuantity(item.totalRemaining, unit)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Available stock
                      </p>
                    </div>

                    <div className="mt-5 grid gap-2 border-t border-[color:var(--border-muted)] pt-4 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]">
                          <Layers3 aria-hidden className="size-4" />
                          Batches
                        </span>
                        <span className="font-semibold text-[var(--text-primary)]">
                          {item.batches.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--text-muted)]">Stock value</span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {formatMoney(item.estimatedValue)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--text-muted)]">Latest intake</span>
                        <span className="font-medium text-[var(--text-primary)]">
                          {latestBatch ? formatDate(latestBatch.batchDate) : "No batches"}
                        </span>
                      </div>
                      {earliestBatch ? (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[var(--text-muted)]">
                            Current batch
                          </span>
                          <span className="font-medium text-[var(--text-primary)]">
                            {earliestBatch.batchLabel}
                          </span>
                        </div>
                      ) : null}
                    </div>

                    <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-semibold text-[var(--brand-burgundy)]">
                      View details
                      <ArrowRight
                        aria-hidden
                        className="size-4 transition group-hover:translate-x-0.5"
                      />
                    </span>
                  </Link>

                  <div className="flex items-center justify-between gap-3 border-t border-[color:var(--border-muted)] px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-muted)]">
                        Unit price / {unit}
                      </p>
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                        {item.rawMaterial.unitCost
                          ? formatMoney(item.rawMaterial.unitCost)
                          : "Not set"}
                      </p>
                    </div>
                    <EditUnitPriceModal
                      materialId={item.rawMaterial.id}
                      materialName={item.rawMaterial.name}
                      unit={unit}
                      unitPrice={item.rawMaterial.unitCost}
                    />
                  </div>
                </article>
              );
            })}
          </div>
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
