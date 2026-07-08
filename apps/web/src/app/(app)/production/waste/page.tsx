import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type {
  ProductionWaste,
  ProductionWasteType,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import { apiGet } from "@/lib/server-api";

const wasteTypeLabels: Record<ProductionWasteType, string> = {
  DAMAGED: "Damaged",
  RETURNED_TO_PRODUCTION: "Back to production",
};

function WasteTypeBadge({ type }: { type: ProductionWasteType }) {
  const className =
    type === "DAMAGED"
      ? "bg-red-50 text-red-800"
      : "bg-emerald-50 text-emerald-800";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {wasteTypeLabels[type]}
    </span>
  );
}

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

export default async function ProductionWastePage() {
  const waste = await apiGet<ProductionWaste[]>("/production/waste");

  return (
    <>
      <PageHeader
        title="Production waste"
        description="Waste and spoilage recorded during production runs."
      />

      <Card title={`Waste records (${waste.length})`}>
        {waste.length === 0 ? (
          <EmptyState>No waste has been recorded yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Reason</th>
                <th className="py-2 pr-4">Recorded at</th>
                <th className="py-2 pr-4">Recorded by</th>
              </>
            }
          >
            {waste.map((record) => (
              <tr className="align-top" key={record.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  {formatProductName(record.product)}
                </td>
                <td className="py-3 pr-4">
                  <WasteTypeBadge type={record.type} />
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    record.quantity,
                    record.product.unit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {record.reason ?? "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(record.recordedAt)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {record.createdBy?.name ?? record.createdBy?.email ?? "-"}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
