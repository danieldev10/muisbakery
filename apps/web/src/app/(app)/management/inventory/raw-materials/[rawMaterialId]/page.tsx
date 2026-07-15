import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

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
} from "../../../_components";
import { EditUnitPriceModal } from "../edit-unit-price-modal";

const inventoryPath = "/management/inventory/raw-materials";

export default async function ManagementRawMaterialDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ rawMaterialId: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ rawMaterialId }, query] = await Promise.all([params, searchParams]);
  const report = await apiGet<ManagementInventoryReport>("/management/inventory");
  const item = report.rawMaterials.find(
    (entry) => entry.rawMaterial.id === rawMaterialId,
  );

  if (!item) {
    notFound();
  }

  const unit = item.rawMaterial.baseUnit.abbreviation;
  const basePath = `${inventoryPath}/${rawMaterialId}`;
  const search = firstParam(query, "q");
  const supplier = firstParam(query, "supplier");
  const receivedFrom = firstParam(query, "from");
  const receivedTo = firstParam(query, "to");
  const supplierOptions = [
    ...new Map(
      item.batches
        .filter((batch) => batch.supplier)
        .map((batch) => [
          batch.supplier!.id,
          { label: batch.supplier!.name, value: batch.supplier!.id },
        ]),
    ).values(),
  ];
  const filteredBatches = item.batches.filter(
    (batch) =>
      matchesSearch(search, [
        batch.batchNumber,
        batch.batchLabel,
        batch.supplier?.name,
        batch.quantityReceived,
        batch.quantityRemaining,
        batch.unitCost,
        batch.estimatedValue,
      ]) &&
      matchesSelect(supplier, batch.supplier?.id ?? "") &&
      matchesDateRange(batch.receivedAt, receivedFrom, receivedTo),
  );
  const { pageItems, ...pagination } = paginate(
    filteredBatches,
    pageNumber(query.page),
  );
  const reportSections = [
    {
      title: "Raw material summary",
      rows: [
        {
          Material: item.rawMaterial.name,
          "Base unit": unit,
          "Unit price": item.rawMaterial.unitCost
            ? formatMoney(item.rawMaterial.unitCost)
            : "Not set",
          Remaining: formatQuantity(item.totalRemaining, unit),
          "Stock value": formatMoney(item.estimatedValue),
          Batches: item.batches.length,
        },
      ],
    },
    {
      title: "Batches",
      rows: filteredBatches.map((batch) => ({
        Batch: batch.batchLabel,
        Date: formatDate(batch.batchDate),
        Supplier: batch.supplier?.name ?? "",
        Received: formatQuantity(batch.quantityReceived, unit),
        Remaining: formatQuantity(batch.quantityRemaining, unit),
        "Unit cost": batch.unitCost ? formatMoney(batch.unitCost) : "",
        Value: formatMoney(batch.estimatedValue),
      })),
    },
  ];

  return (
    <ManagementPageShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex h-10 items-center justify-center gap-2 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-4 text-sm font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)]"
          href={inventoryPath}
        >
          <ArrowLeft aria-hidden className="size-4" />
          Raw materials
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <EditUnitPriceModal
            materialId={item.rawMaterial.id}
            materialName={item.rawMaterial.name}
            unit={unit}
            unitPrice={item.rawMaterial.unitCost}
          />
          <ReportExportActions
            filename={`management-${item.rawMaterial.name}-inventory`}
            sections={reportSections}
            title={`${item.rawMaterial.name} inventory report`}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          detail={`Base unit: ${item.rawMaterial.baseUnit.name}`}
          label="Material"
          value={item.rawMaterial.name}
        />
        <MetricCard
          label="Available"
          value={formatQuantity(item.totalRemaining, unit)}
        />
        <MetricCard
          detail={`Per ${unit}`}
          label="Unit price"
          value={
            item.rawMaterial.unitCost
              ? formatMoney(item.rawMaterial.unitCost)
              : "Not set"
          }
        />
        <MetricCard
          detail={`Estimated value ${formatMoney(item.estimatedValue)}`}
          label="Batches"
          value={item.batches.length}
        />
      </div>

      <Card
        title={`${item.rawMaterial.name} batches (${filteredBatches.length} of ${item.batches.length})`}
      >
        {item.batches.length > 0 ? (
          <TableToolbar
            basePath={basePath}
            dateFilters={[
              { label: "Received from", name: "from" },
              { label: "Received to", name: "to" },
            ]}
            searchParams={query}
            searchPlaceholder="Search batch, supplier, quantity, cost, or value"
            selectFilters={[
              {
                label: "Supplier",
                name: "supplier",
                options: supplierOptions,
              },
            ]}
          />
        ) : null}
        {item.batches.length === 0 ? (
          <EmptyState>No batches have been recorded for this material.</EmptyState>
        ) : filteredBatches.length === 0 ? (
          <EmptyState>No batches match the current filters.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Batch date</th>
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4">Received</th>
                <th className="py-2 pr-4">Remaining</th>
                <th className="py-2 pr-4">Unit cost</th>
                <th className="py-2 pr-4">Value</th>
              </>
            }
          >
            {pageItems.map((batch) => (
              <tr className="align-top" key={batch.id}>
                <td className="py-3 pr-4 font-medium text-[var(--text-primary)]">
                  {batch.batchLabel}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {formatDate(batch.batchDate)}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {batch.supplier?.name ?? "-"}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {formatQuantity(batch.quantityReceived, unit)}
                </td>
                <td className="py-3 pr-4 font-medium text-[var(--brand-burgundy)]">
                  {formatQuantity(batch.quantityRemaining, unit)}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {batch.unitCost ? formatMoney(batch.unitCost) : "-"}
                </td>
                <td className="py-3 pr-4 text-[var(--text-secondary)]">
                  {formatMoney(batch.estimatedValue)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
        <TablePagination
          basePath={basePath}
          searchParams={query}
          {...pagination}
        />
      </Card>
    </ManagementPageShell>
  );
}
