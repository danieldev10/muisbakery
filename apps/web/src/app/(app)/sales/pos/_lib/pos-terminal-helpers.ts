import type {
  CustomerType,
  PaymentMethod,
  PosSession,
  SalePriceType,
  SalesInventoryItem,
  SalesOptions,
} from "@/lib/operations/types";

export const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

export const fieldClass =
  "h-10 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]";

export const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white text-[var(--text-secondary)] shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] hover:text-[var(--brand-burgundy)] disabled:cursor-not-allowed disabled:opacity-50";

export type PosSessionPatch = {
  customerType?: CustomerType;
  priceType?: SalePriceType;
  retailerId?: string | null;
  retailerApprovalId?: string | null;
  customerName?: string | null;
  paymentMethod?: PaymentMethod;
  amountPaid?: string | null;
  notes?: string | null;
};

export function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatQuantity(value: string | number, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

export async function apiJson<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/sales/pos${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "Request failed.";
    throw new Error(message);
  }

  return data as T;
}

export function productAvailable(item: SalesInventoryItem) {
  return Math.floor(Number(item.totalRemaining));
}

export function roundCount(value: number) {
  return Math.floor(Math.max(0, value));
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyString(value: number) {
  return roundMoney(value).toFixed(2);
}

export function productPriceForType(
  product: SalesInventoryItem["product"],
  priceType: SalePriceType = "WALK_IN",
) {
  if (priceType === "RETAILER") {
    return product.retailerPrice;
  }

  const walkInPrice = Number(product.unitPrice ?? 0);

  if (priceType === "DISCOUNTED") {
    const discountPercent = Number(product.discountPercent ?? 0);
    return moneyString(walkInPrice * (1 - discountPercent / 100));
  }

  return product.unitPrice;
}

export function withOptimisticProductQuantity(
  session: PosSession,
  inventory: SalesInventoryItem,
  requestedQuantity: number,
) {
  const quantity = roundCount(requestedQuantity);
  const unitPrice = Number(
    productPriceForType(inventory.product, session.priceType) ?? 0,
  );
  const existing = session.items.find(
    (item) => item.product.id === inventory.product.id,
  );
  const nextItem = {
    id: existing?.id ?? `pending-${inventory.product.id}`,
    quantity: String(quantity),
    unitPrice: moneyString(unitPrice),
    lineTotal: moneyString(quantity * unitPrice),
    product: inventory.product,
  };
  const items =
    quantity === 0
      ? session.items.filter(
          (item) => item.product.id !== inventory.product.id,
        )
      : existing
        ? session.items.map((item) =>
            item.product.id === inventory.product.id ? nextItem : item,
          )
        : [...session.items, nextItem];
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + Number(item.lineTotal), 0),
  );
  const totalAmount = subtotal;
  const previousTotal = Number(session.totalAmount);
  const previousPaid = Number(session.amountPaid);
  const amountPaid =
    session.paymentMethod !== "CREDIT" &&
    Math.abs(previousPaid - previousTotal) < 0.01
      ? totalAmount
      : previousPaid;
  const balanceDue = Math.max(0, roundMoney(totalAmount - amountPaid));

  return {
    ...session,
    items,
    subtotal: moneyString(subtotal),
    totalAmount: moneyString(totalAmount),
    amountPaid: moneyString(amountPaid),
    balanceDue: moneyString(balanceDue),
  };
}

export function createOptimisticPosSession(
  counter: SalesOptions["counters"][number],
  inventory: SalesInventoryItem,
  quantity: number,
) {
  const now = new Date().toISOString();
  const session: PosSession = {
    id: "pending-session",
    displayToken: counter.displayToken,
    terminal: {
      id: counter.id,
      name: counter.name,
      displayToken: counter.displayToken,
      isActive: true,
    },
    status: "ACTIVE",
    customerType: "INDIVIDUAL",
    priceType: "WALK_IN",
    retailer: null,
    retailerApprovalId: null,
    customerName: null,
    paymentMethod: "CASH",
    discount: "0.00",
    amountPaid: "0.00",
    balanceDue: "0.00",
    subtotal: "0.00",
    totalAmount: "0.00",
    notes: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    completedSale: null,
    items: [],
  };

  return withOptimisticProductQuantity(session, inventory, quantity);
}

export function configuredProductDiscountAmount(session: PosSession) {
  if (session.priceType !== "DISCOUNTED") {
    return 0;
  }

  return roundMoney(
    session.items.reduce((sum, item) => {
      const walkInPrice = Number(item.product.unitPrice ?? 0);
      const discountedPrice = Number(item.unitPrice);
      return (
        sum +
        Math.max(0, walkInPrice - discountedPrice) * Number(item.quantity)
      );
    }, 0),
  );
}
