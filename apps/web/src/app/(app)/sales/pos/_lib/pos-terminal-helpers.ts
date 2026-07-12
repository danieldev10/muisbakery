import type {
  CustomerType,
  PaymentMethod,
  PosSession,
  PosSessionItem,
  SalesInventoryItem,
} from "@/lib/operations/types";

export const CART_SYNC_DELAY_MS = 250;

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
  retailerId?: string | null;
  retailerApprovalId?: string | null;
  customerName?: string | null;
  paymentMethod?: PaymentMethod;
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
  const terminalSecret =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("muisbakery.posTerminalSecret");

  const response = await fetch(`/api/sales/pos${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(terminalSecret
        ? { "x-muisbakery-pos-terminal-secret": terminalSecret }
        : {}),
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

function quantityString(value: number) {
  return String(roundCount(value));
}

function moneyString(value: number) {
  return roundMoney(value).toFixed(2);
}

export function calculateSessionTotals(session: PosSession) {
  const subtotal = roundMoney(
    session.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.unitPrice),
      0,
    ),
  );
  const discount = Number(session.discount);
  const totalAmount = Math.max(0, roundMoney(subtotal - discount));
  const previousAmountPaid = Number(session.amountPaid);
  const shouldFollowTotal =
    session.paymentMethod !== "CREDIT" &&
    (!Number.isFinite(previousAmountPaid) ||
      previousAmountPaid === Number(session.totalAmount));
  const amountPaid =
    session.paymentMethod === "CREDIT"
      ? Number.isFinite(previousAmountPaid)
        ? previousAmountPaid
        : 0
      : shouldFollowTotal
        ? totalAmount
        : previousAmountPaid;
  const balanceDue = Math.max(0, roundMoney(totalAmount - amountPaid));

  return {
    ...session,
    subtotal: moneyString(subtotal),
    totalAmount: moneyString(totalAmount),
    amountPaid: moneyString(amountPaid),
    balanceDue: moneyString(balanceDue),
    items: session.items.map((item) => ({
      ...item,
      lineTotal: moneyString(Number(item.quantity) * Number(item.unitPrice)),
    })),
  };
}

export function updateSessionProductQuantity(
  session: PosSession,
  item: SalesInventoryItem,
  quantity: number,
) {
  const productId = item.product.id;
  const existing = session.items.find((entry) => entry.product.id === productId);
  const existingIndex = session.items.findIndex(
    (entry) => entry.product.id === productId,
  );
  const unitPrice = item.product.unitPrice ?? existing?.unitPrice ?? "0";
  const nextQuantity = roundCount(quantity);
  const nextItems = session.items.filter(
    (entry) => entry.product.id !== productId,
  );

  if (nextQuantity > 0) {
    const nextItem: PosSessionItem = {
      id: existing?.id ?? `local-${productId}`,
      quantity: quantityString(nextQuantity),
      unitPrice,
      lineTotal: moneyString(nextQuantity * Number(unitPrice)),
      product: item.product,
    };

    if (existingIndex >= 0) {
      nextItems.splice(existingIndex, 0, nextItem);
    } else {
      nextItems.push(nextItem);
    }
  }

  return calculateSessionTotals({
    ...session,
    items: nextItems,
    updatedAt: new Date().toISOString(),
  });
}
