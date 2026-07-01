import { AdminForm } from "@/components/admin/admin-form";
import {
  Field,
  SelectField,
  TextareaField,
} from "@/components/admin/form-controls";
import {
  Card,
  EmptyState,
  PageHeader,
  TableShell,
} from "@/components/admin/layout";
import type { RawMaterialReceipt, StoreOptions } from "@/lib/operations/types";
import { apiGet } from "@/lib/server-api";

import { receiveRawMaterial } from "./actions";

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

function formatMoney(value: string | null) {
  if (!value) {
    return "-";
  }

  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default async function StoreReceivingPage() {
  const [options, receipts] = await Promise.all([
    apiGet<StoreOptions>("/store/options"),
    apiGet<RawMaterialReceipt[]>("/store/receipts"),
  ]);

  const materialOptions = options.rawMaterials.map((material) => ({
    value: material.id,
    label: `${material.name} (${material.baseUnit.abbreviation})`,
  }));
  const supplierOptions = options.suppliers.map((supplier) => ({
    value: supplier.id,
    label: supplier.name,
  }));

  return (
    <>
      <PageHeader
        title="Receive raw materials"
        description="Record daily raw material receipts and create FIFO batches."
      />

      <Card title="New receipt">
        {materialOptions.length === 0 ? (
          <EmptyState>
            Active raw materials are required before Store can receive stock.
          </EmptyState>
        ) : (
          <AdminForm action={receiveRawMaterial} submitLabel="Receive stock">
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Raw material"
                name="rawMaterialId"
                options={materialOptions}
                placeholder="Select material"
                required
              />
              <SelectField
                label="Supplier"
                name="supplierId"
                options={supplierOptions}
                placeholder="No supplier selected"
              />
              <Field
                label="Quantity"
                min="0"
                name="quantity"
                placeholder="0.000"
                required
                step="0.001"
                type="number"
              />
              <Field
                label="Unit cost"
                min="0"
                name="unitCost"
                step="0.01"
                type="number"
              />
              <Field
                label="Received at"
                name="receivedAt"
                type="text"
                hint="Optional. Leave blank to use the current date and time."
                placeholder="2026-06-30T09:00"
              />
              <Field
                label="Reference"
                name="reference"
                placeholder="Invoice or delivery note"
              />
            </div>
            <TextareaField label="Notes" name="notes" placeholder="Optional" />
          </AdminForm>
        )}
      </Card>

      <Card title={`Recent receipts (${receipts.length})`}>
        {receipts.length === 0 ? (
          <EmptyState>No receipts yet.</EmptyState>
        ) : (
          <TableShell
            head={
              <>
                <th className="py-2 pr-4">Batch</th>
                <th className="py-2 pr-4">Material</th>
                <th className="py-2 pr-4">Received</th>
                <th className="py-2 pr-4">Quantity</th>
                <th className="py-2 pr-4">Supplier</th>
                <th className="py-2 pr-4">Unit cost</th>
              </>
            }
          >
            {receipts.map((receipt) => (
              <tr className="align-top" key={receipt.id}>
                <td className="py-3 pr-4 font-medium text-stone-900">
                  Batch {receipt.batch.batchNumber}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {receipt.rawMaterial.name}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatDate(receipt.receivedAt)}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatQuantity(
                    receipt.quantity,
                    receipt.rawMaterial.baseUnit.abbreviation,
                  )}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {receipt.supplier?.name ?? "-"}
                </td>
                <td className="py-3 pr-4 text-stone-600">
                  {formatMoney(receipt.unitCost)}
                </td>
              </tr>
            ))}
          </TableShell>
        )}
      </Card>
    </>
  );
}
