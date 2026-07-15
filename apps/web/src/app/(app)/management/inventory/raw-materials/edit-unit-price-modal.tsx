import { Pencil } from "lucide-react";

import { Field } from "@/components/admin/form-controls";
import { AdminFormModal } from "@/components/admin/form-modal";

import { updateRawMaterialUnitCost } from "../actions";

const editButtonClass =
  "inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-xs font-semibold text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--brand-tint)] hover:text-[var(--brand-burgundy)]";

export function EditUnitPriceModal({
  materialId,
  materialName,
  unit,
  unitPrice,
}: {
  materialId: string;
  materialName: string;
  unit: string;
  unitPrice: string | null;
}) {
  return (
    <AdminFormModal
      action={updateRawMaterialUnitCost}
      description={`Set the management-controlled price for one ${unit} of ${materialName}.`}
      eyebrow="Management"
      submitLabel="Save unit price"
      title={`Edit ${materialName}`}
      triggerClassName={editButtonClass}
      triggerIcon={<Pencil aria-hidden className="size-3.5" />}
      triggerLabel="Edit"
      triggerTitle={`Edit unit price for ${materialName}`}
      widthClassName="max-w-lg"
    >
      <input name="id" type="hidden" value={materialId} />
      <Field
        defaultValue={unitPrice ?? ""}
        hint={`Price per ${unit}`}
        label="Unit price"
        min="0"
        name="unitCost"
        placeholder="0.00"
        required
        step="0.01"
        type="number"
      />
    </AdminFormModal>
  );
}
