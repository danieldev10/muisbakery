import type {
  CustomerType,
  PaymentMethod,
  PosOfflineSalePayload,
  SalePriceType,
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
  priceType?: SalePriceType;
  retailerId?: string | null;
  retailerApprovalId?: string | null;
  customerName?: string | null;
  paymentMethod?: PaymentMethod;
  discount?: string;
  amountPaid?: string | null;
  notes?: string | null;
};

type BrowserCrypto = {
  randomUUID?: () => string;
  getRandomValues<T extends ArrayBufferView | null>(array: T): T;
};

export function createUuid(
  cryptoApi: BrowserCrypto | null | undefined = globalThis.crypto,
) {
  if (!cryptoApi || typeof cryptoApi.getRandomValues !== "function") {
    throw new Error(
      "This browser cannot generate the secure identifier required for POS sales.",
    );
  }

  if (typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  // randomUUID is restricted to secure contexts, while getRandomValues also
  // supports a locally hosted POS opened over a private-network HTTP address.
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

export function repriceSession(
  session: PosSession,
  priceType: SalePriceType,
) {
  return calculateSessionTotals({
    ...session,
    priceType,
    items: session.items.map((item) => {
      const unitPrice = productPriceForType(item.product, priceType) ?? "0";

      return {
        ...item,
        unitPrice,
        lineTotal: moneyString(Number(item.quantity) * Number(unitPrice)),
      };
    }),
    updatedAt: new Date().toISOString(),
  });
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
  const unitPrice =
    productPriceForType(item.product, session.priceType) ??
    existing?.unitPrice ??
    "0";
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

export function createLocalPosSession(input: {
  id: string;
  terminalId: string;
  terminalDisplayToken: string;
  createdAt: string;
}): PosSession {
  return {
    id: input.id,
    displayToken: "",
    terminal: {
      id: input.terminalId,
      displayToken: input.terminalDisplayToken,
      offlineEnabled: true,
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
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    completedAt: null,
    completedSale: null,
    items: [],
  };
}

export function buildPosDisplayPreview(session: PosSession | null) {
  if (!session) {
    return { session: null };
  }

  return {
    session: {
      id: session.id,
      status: session.status,
      customerType: session.customerType,
      customerName: session.customerName,
      paymentMethod: session.paymentMethod,
      discount: session.discount,
      amountPaid: session.amountPaid,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      completedAt: session.completedAt,
      items: session.items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    },
  };
}

export function buildOfflineSalePayload(input: {
  session: PosSession;
  terminalId: string;
  clientRequestId: string;
  soldAt: string;
}): PosOfflineSalePayload {
  return {
    terminalId: input.terminalId,
    clientRequestId: input.clientRequestId,
    customerType: input.session.customerType,
    priceType: input.session.priceType,
    retailerId: input.session.retailer?.id,
    retailerApprovalId: input.session.retailerApprovalId ?? undefined,
    paymentMethod: input.session.paymentMethod,
    customerName: input.session.customerName ?? undefined,
    soldAt: input.soldAt,
    discount: input.session.discount,
    amountPaid: input.session.amountPaid,
    notes: input.session.notes
      ? `Offline POS checkout. ${input.session.notes}`
      : `Offline POS checkout from ${input.session.id}.`,
    items: input.session.items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}
