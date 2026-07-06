import type { AppRole } from "@/lib/roles";

export type AdminUser = {
  id: string;
  name: string | null;
  email: string;
  role: AppRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type Unit = {
  id: string;
  name: string;
  abbreviation: string;
  isActive: boolean;
};

export type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
};

export type UnitRef = { id: string; name: string; abbreviation: string };

export type RawMaterial = {
  id: string;
  name: string;
  description: string | null;
  baseUnitId: string;
  unitCost: string | null;
  baseUnit: UnitRef;
  isActive: boolean;
};

export type RawMaterialRecipeOption = {
  value: string;
  label: string;
  unitId: string;
  unitLabel: string;
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  unitId: string;
  unit: UnitRef;
  unitPrice: string | null;
  isActive: boolean;
};

export type RecipeItem = {
  id: string;
  rawMaterialId: string;
  quantity: string;
  unitId: string;
  rawMaterial: { id: string; name: string };
  unit: { id: string; abbreviation: string };
};

export type Recipe = {
  id: string;
  productId: string;
  product: { id: string; name: string };
  yieldQuantity: string;
  notes: string | null;
  isActive: boolean;
  items: RecipeItem[];
};

export type ExpenseCategory = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
};

export type AppSettings = {
  requireMaterialRequestApproval: boolean;
  requireStockAdjustmentApproval: boolean;
};

export type FormState = {
  ok: boolean;
  error: string | null;
  /** Increments on each successful submit so clients can reset the form. */
  token?: number;
};

export const initialFormState: FormState = { ok: false, error: null };
