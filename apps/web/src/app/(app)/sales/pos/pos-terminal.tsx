"use client";

import {
  Copy,
  Download,
  ExternalLink,
  Minus,
  Plus,
  Printer,
  Search,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { Spinner } from "@/components/spinner";
import type {
  CustomerType,
  PaymentMethod,
  PosSession,
  Retailer,
  SalePriceType,
  SalesInventoryItem,
  SalesOptions,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";

import {
  apiJson,
  configuredProductDiscountAmount,
  createOptimisticPosSession,
  fieldClass,
  formatMoney,
  formatQuantity,
  iconButtonClass,
  paymentLabels,
  productAvailable,
  productPriceForType,
  roundCount,
  withOptimisticProductQuantity,
  type PosSessionPatch,
} from "./_lib/pos-terminal-helpers";

type ReceiptDocument = {
  filename: string;
  html: string;
  text: string;
};

type CompletedReceipt = {
  document: ReceiptDocument;
  session: PosSession;
};

type PendingQuantity = {
  item: SalesInventoryItem;
  quantity: number;
};

// Coalesce window: rapid taps within this window collapse into a single
// server sync so cashiers never wait on a round trip between taps.
const SYNC_DEBOUNCE_MS = 250;

const COUNTER_STORAGE_KEY = "muisbakery.selectedSalesCounter";
const COUNTER_STORAGE_EVENT = "muisbakery:selected-sales-counter";

function subscribeToCounterStorage(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(COUNTER_STORAGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(COUNTER_STORAGE_EVENT, onStoreChange);
  };
}

function storedCounterId() {
  return window.localStorage.getItem(COUNTER_STORAGE_KEY) ?? "";
}

function serverCounterId() {
  return "";
}

function storeCounterId(counterId: string) {
  window.localStorage.setItem(COUNTER_STORAGE_KEY, counterId);
  window.dispatchEvent(new Event(COUNTER_STORAGE_EVENT));
}

function counterIsSelectable(
  counter: SalesOptions["counters"][number],
) {
  return !counter.currentSessionId || counter.occupiedByCurrentUser;
}

function defaultCounterId(counters: SalesOptions["counters"]) {
  return counters.find(counterIsSelectable)?.id ?? "";
}

function receiptDate(value: string | null | undefined) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value ? new Date(value) : new Date());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function receiptCustomer(session: PosSession) {
  if (session.customerType === "RETAILER") {
    return session.retailer?.name ?? session.customerName ?? "Retailer";
  }

  return session.customerName ?? "Individual";
}

function buildReceiptDocument({
  session,
  terminalName,
}: {
  session: PosSession;
  terminalName: string | null | undefined;
}): ReceiptDocument {
  const saleNumber = session.completedSale?.saleNumber ?? null;
  const saleLabel = saleNumber ? `#${saleNumber}` : null;
  const soldAt = session.completedSale?.soldAt ?? session.completedAt;
  const itemLines = session.items.map(
    (item) =>
      `${formatProductName(item.product)} x ${formatQuantity(
        item.quantity,
        item.product.unit.abbreviation,
      )} @ ${formatMoney(item.unitPrice)} = ${formatMoney(item.lineTotal)}`,
  );
  const lines = [
    "Muis Bakery",
    "Sales receipt",
    ...(saleLabel ? [`Sale: ${saleLabel}`] : []),
    `Counter: ${terminalName ?? "Sales counter"}`,
    `Customer: ${receiptCustomer(session)}`,
    `Payment: ${paymentLabels[session.paymentMethod]}`,
    `Date: ${receiptDate(soldAt)}`,
    "",
    ...itemLines,
    "",
    `Subtotal: ${formatMoney(session.subtotal)}`,
    `Discount: ${formatMoney(session.discount)}`,
    `Total: ${formatMoney(session.totalAmount)}`,
    `Paid: ${formatMoney(session.amountPaid)}`,
    `Balance due: ${formatMoney(session.balanceDue)}`,
  ];
  const text = lines.join("\n");
  const htmlRows = session.items
    .map(
      (item) => `
        <tr>
          <td class="item-description">
            <strong>${escapeHtml(formatProductName(item.product))}</strong>
            <span>${escapeHtml(formatQuantity(item.quantity, item.product.unit.abbreviation))} x ${escapeHtml(formatMoney(item.unitPrice))}</span>
          </td>
          <td class="amount">${escapeHtml(formatMoney(item.lineTotal))}</td>
        </tr>`,
    )
    .join("");
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Muis Bakery Receipt${saleLabel ? ` ${escapeHtml(saleLabel)}` : ""}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          * { box-sizing: border-box; }
          html, body {
            width: 80mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
          }
          body {
            font-family: "Courier New", Courier, monospace;
            font-size: 10pt;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt {
            width: 72mm;
            margin: 0 auto;
            padding: 3mm 1mm 5mm;
          }
          .receipt-header {
            border-bottom: 1px dashed #000;
            margin-bottom: 2.5mm;
            padding-bottom: 2.5mm;
            text-align: center;
          }
          h1 { font-size: 16pt; line-height: 1.1; margin: 0 0 1mm; }
          h2 { font-size: 10pt; margin: 0; text-transform: uppercase; }
          .meta { margin: 0 0 2.5mm; }
          p { margin: 0.8mm 0; }
          table {
            border-collapse: collapse;
            table-layout: fixed;
            width: 100%;
            margin: 2.5mm 0;
          }
          th, td {
            border-bottom: 1px dashed #000;
            padding: 1.8mm 0;
            text-align: left;
            vertical-align: top;
          }
          th { font-size: 9pt; text-transform: uppercase; }
          th:last-child, .amount {
            width: 24mm;
            padding-left: 2mm;
            text-align: right;
            white-space: nowrap;
          }
          .item-description {
            overflow-wrap: anywhere;
            padding-right: 1mm;
          }
          .item-description strong,
          .item-description span { display: block; }
          .item-description span { margin-top: 0.5mm; font-size: 9pt; }
          .totals { border-top: 2px solid #000; padding-top: 1.5mm; }
          .totals p {
            display: flex;
            justify-content: space-between;
            gap: 3mm;
          }
          .totals span:last-child { white-space: nowrap; }
          .total { font-size: 13pt; font-weight: 700; }
          .receipt-footer {
            border-top: 1px dashed #000;
            margin-top: 3mm;
            padding-top: 2.5mm;
            text-align: center;
          }
          tr, .totals, .receipt-footer { break-inside: avoid; }
          @media screen {
            body { min-height: 100vh; }
            .receipt { box-shadow: 0 0 0 1px #ddd; }
          }
          @media print {
            html, body { min-height: 0; }
            .receipt { box-shadow: none; }
          }
        </style>
      </head>
      <body>
        <div class="receipt">
          <div class="receipt-header">
            <h1>Muis Bakery</h1>
            <h2>Sales receipt</h2>
          </div>
          <div class="meta">
            ${saleLabel ? `<p><strong>Sale:</strong> ${escapeHtml(saleLabel)}</p>` : ""}
            <p><strong>Counter:</strong> ${escapeHtml(terminalName ?? "Sales counter")}</p>
            <p><strong>Customer:</strong> ${escapeHtml(receiptCustomer(session))}</p>
            <p><strong>Payment:</strong> ${escapeHtml(paymentLabels[session.paymentMethod])}</p>
            <p><strong>Date:</strong> ${escapeHtml(receiptDate(soldAt))}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>${htmlRows}</tbody>
          </table>
          <div class="totals">
            <p><span>Subtotal</span><span>${escapeHtml(formatMoney(session.subtotal))}</span></p>
            <p><span>Discount</span><span>${escapeHtml(formatMoney(session.discount))}</span></p>
            <p class="total"><span>Total</span><span>${escapeHtml(formatMoney(session.totalAmount))}</span></p>
            <p><span>Paid</span><span>${escapeHtml(formatMoney(session.amountPaid))}</span></p>
            <p><span>Balance due</span><span>${escapeHtml(formatMoney(session.balanceDue))}</span></p>
          </div>
          <div class="receipt-footer">
            <strong>Thank you for your purchase</strong>
          </div>
        </div>
      </body>
    </html>`;

  return {
    filename: `muis-bakery-receipt-${String(saleLabel ?? session.id)
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()}`,
    html,
    text,
  };
}

function reserveReceiptPrintFrame() {
  const frame = document.createElement("iframe");

  frame.title = "Receipt print frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  return frame;
}

function printReceipt(
  receipt: ReceiptDocument,
  reservedFrame?: HTMLIFrameElement | null,
) {
  const receiptFrame = reservedFrame ?? reserveReceiptPrintFrame();
  const receiptWindow = receiptFrame.contentWindow;

  if (!receiptWindow) {
    receiptFrame.remove();
    return false;
  }

  receiptWindow.document.open();
  receiptWindow.document.write(receipt.html);
  receiptWindow.document.close();

  const cleanup = () => receiptFrame.remove();

  window.setTimeout(() => {
    try {
      receiptWindow.addEventListener("afterprint", cleanup, { once: true });
      receiptWindow.focus();
      receiptWindow.print();
      window.setTimeout(cleanup, 120_000);
    } catch {
      cleanup();
    }
  }, 250);

  return true;
}

function downloadReceipt(receipt: ReceiptDocument) {
  const blob = new Blob([receipt.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${receipt.filename}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fallbackCopy(value: string) {
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  field.remove();
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Private-network HTTP may block the Clipboard API.
    }
  }

  fallbackCopy(value);
}

function validApprovedOrders(retailer: Retailer | null) {
  const now = Date.now();

  return (
    retailer?.orderApprovals.filter(
      (approval) =>
        approval.status === "APPROVED" &&
        !approval.usedAt &&
        (!approval.expiresAt ||
          new Date(approval.expiresAt).getTime() > now),
    ) ?? []
  );
}

function salePriceLabel(priceType: SalePriceType) {
  if (priceType === "RETAILER") {
    return "Retailer";
  }
  if (priceType === "DISCOUNTED") {
    return "Discounted";
  }
  return "Walk-in";
}

function QuantityInput({
  busy,
  entry,
  maximum,
  onCommit,
}: {
  busy: boolean;
  entry: PosSession["items"][number];
  maximum: number;
  onCommit: (quantity: number) => void;
}) {
  const quantity = roundCount(Number(entry.quantity));
  const [value, setValue] = useState(String(quantity));

  function commit() {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      setValue(String(quantity));
      return;
    }

    const nextQuantity = Math.min(
      maximum,
      Math.max(0, roundCount(parsed)),
    );
    setValue(String(nextQuantity));

    if (nextQuantity !== quantity) {
      onCommit(nextQuantity);
    }
  }

  return (
    <input
      aria-label={`${formatProductName(entry.product)} quantity`}
      className={`${fieldClass} w-24 text-center`}
      disabled={busy}
      inputMode="numeric"
      max={maximum}
      min="0"
      onBlur={commit}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      step="1"
      type="number"
      value={value}
    />
  );
}

export function PosTerminal({ options }: { options: SalesOptions }) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [query, setQuery] = useState("");
  const [retailers, setRetailers] = useState(options.retailers);
  const persistedCounterId = useSyncExternalStore(
    subscribeToCounterStorage,
    storedCounterId,
    serverCounterId,
  );
  const persistedCounter = options.counters.find(
    (counter) => counter.id === persistedCounterId,
  );
  const selectedCounterId =
    persistedCounter && counterIsSelectable(persistedCounter)
      ? persistedCounter.id
      : defaultCounterId(options.counters);
  const [availability, setAvailability] = useState<Record<string, number>>(
    Object.fromEntries(
      options.products.map((item) => [
        item.product.id,
        productAvailable(item),
      ]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cartSaving, setCartSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [lastReceipt, setLastReceipt] = useState<CompletedReceipt | null>(null);
  // Desired quantity per product that has not yet been confirmed by the
  // server. Kept in a ref so taps can accumulate synchronously without
  // waiting on React state or the network.
  const pendingRef = useRef(new Map<string, PendingQuantity>());
  const flushingRef = useRef(false);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef<PosSession | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const lastSyncedRef = useRef<PosSession | null>(null);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const updateConnection = () => setIsOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const selectedCounter =
    options.counters.find((counter) => counter.id === selectedCounterId) ?? null;
  const selectableCounterCount = options.counters.filter(
    counterIsSelectable,
  ).length;
  const activeRetailer =
    session?.retailer &&
    retailers.find((retailer) => retailer.id === session.retailer?.id)
      ? retailers.find((retailer) => retailer.id === session.retailer?.id) ??
        null
      : null;
  const approvedOrders = validApprovedOrders(activeRetailer);
  const hasPendingApprovalRequest =
    activeRetailer?.orderApprovalRequests.some(
      (approval) => approval.status === "PENDING",
    ) ?? false;
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();

    return options.products.filter((item) => {
      if (!normalized) {
        return true;
      }
      return formatProductName(item.product)
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [options.products, query]);
  const displayUrl = selectedCounter
    ? `/customer-display/terminal/${selectedCounter.displayToken}`
    : "";

  function requireConnection() {
    if (!navigator.onLine) {
      setError("An internet or server connection is required to process sales.");
      return false;
    }

    if (!selectedCounterId) {
      setError("Select a sales counter before adding products.");
      return false;
    }

    if (selectedCounter && !counterIsSelectable(selectedCounter)) {
      setError(
        `${selectedCounter.name ?? "This sales counter"} is already in use by ${
          selectedCounter.occupiedByName ?? "another cashier"
        }. Select another counter.`,
      );
      return false;
    }

    return true;
  }

  async function createSession(
    customerType: CustomerType = "INDIVIDUAL",
    commit = true,
  ) {
    if (!requireConnection()) {
      return null;
    }

    const retailer =
      customerType === "RETAILER" ? retailers.find((item) => item.isActive) : null;
    const created = await apiJson<PosSession>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        terminalId: selectedCounterId,
        customerType,
        ...(retailer ? { retailerId: retailer.id } : {}),
      }),
    });

    sessionIdRef.current = created.id;
    lastSyncedRef.current = created;

    if (commit) {
      setSession(created);
    }
    return created;
  }

  async function updateSession(
    patch: PosSessionPatch,
    target: PosSession | null = session,
  ) {
    if (!target || !requireConnection()) {
      return null;
    }

    const updated = await apiJson<PosSession>(`/sessions/${target.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });

    sessionIdRef.current = updated.id;
    lastSyncedRef.current = updated;
    setSession(updated);
    return updated;
  }

  function currentQuantity(productId: string) {
    const pending = pendingRef.current.get(productId);
    if (pending) {
      return pending.quantity;
    }

    const existing = sessionRef.current?.items.find(
      (item) => item.product.id === productId,
    );
    return Number(existing?.quantity ?? 0);
  }

  function scheduleFlush() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = setTimeout(() => {
      void flushPending();
    }, SYNC_DEBOUNCE_MS);
  }

  // Taps update the cart optimistically and record the desired quantity; the
  // server sync is coalesced (see flushPending) so cashiers never wait on a
  // round trip between taps. Quantities are absolute, so the latest tap wins.
  function enqueueQuantity(
    item: SalesInventoryItem,
    resolve: (current: number) => number,
  ) {
    if (!requireConnection() || busy) {
      return;
    }

    const maximum = availability[item.product.id] ?? 0;
    const current = currentQuantity(item.product.id);
    const nextQuantity = Math.min(
      maximum,
      Math.max(0, roundCount(resolve(current))),
    );

    if (nextQuantity === current) {
      return;
    }

    setError(null);
    setNotice(null);
    setSession((previous) => {
      if (!previous) {
        if (!selectedCounter) {
          return previous;
        }
        return createOptimisticPosSession(selectedCounter, item, nextQuantity);
      }
      return withOptimisticProductQuantity(previous, item, nextQuantity);
    });
    pendingRef.current.set(item.product.id, { item, quantity: nextQuantity });
    setCartSaving(true);
    scheduleFlush();
  }

  function nextPendingQuantity() {
    const iterator = pendingRef.current.entries().next();
    return iterator.done ? null : iterator.value;
  }

  async function flushPending() {
    if (flushingRef.current) {
      return;
    }
    if (pendingRef.current.size === 0) {
      setCartSaving(false);
      return;
    }

    flushingRef.current = true;

    try {
      let sessionId = sessionIdRef.current;

      if (!sessionId) {
        try {
          const created = await createSession("INDIVIDUAL", false);
          if (!created) {
            pendingRef.current.clear();
            setSession(null);
            return;
          }
          sessionId = created.id;
        } catch (caught) {
          pendingRef.current.clear();
          setSession(null);
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to start the sale.",
          );
          return;
        }
      }

      let latest: PosSession | null = null;

      for (;;) {
        const entry = nextPendingQuantity();
        if (!entry) {
          break;
        }

        const [productId, next] = entry;
        const sendingQuantity = next.quantity;

        try {
          latest = await apiJson<PosSession>(`/sessions/${sessionId}/items`, {
            method: "PATCH",
            body: JSON.stringify({ productId, quantity: sendingQuantity }),
          });
          lastSyncedRef.current = latest;
          sessionIdRef.current = latest.id;

          // Only clear once the cashier has not tapped this product again while
          // the request was in flight; otherwise re-send the newer quantity.
          if (
            pendingRef.current.get(productId)?.quantity === sendingQuantity
          ) {
            pendingRef.current.delete(productId);
          }
        } catch (caught) {
          pendingRef.current.clear();
          if (lastSyncedRef.current) {
            setSession(lastSyncedRef.current);
          }
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to update the sale.",
          );
          return;
        }
      }

      // Pending is drained, so this response reflects every product; apply it
      // as the source of truth (prices, totals, item ids).
      if (latest) {
        setSession(latest);
      }
    } finally {
      flushingRef.current = false;
      if (pendingRef.current.size > 0) {
        setCartSaving(true);
        scheduleFlush();
      } else {
        setCartSaving(false);
      }
    }
  }

  async function handleCustomerType(customerType: CustomerType) {
    if (busy || cartSaving || customerType === session?.customerType) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      if (!session) {
        await createSession(customerType);
        return;
      }

      if (customerType === "RETAILER") {
        const retailer = retailers.find((item) => item.isActive);
        if (!retailer) {
          throw new Error("No active retailer account is available.");
        }
        await updateSession({
          customerType,
          priceType: "RETAILER",
          retailerId: retailer.id,
          retailerApprovalId: null,
          paymentMethod: "CREDIT",
          amountPaid: "0",
        });
      } else {
        await updateSession({
          customerType,
          priceType: "WALK_IN",
          retailerId: null,
          retailerApprovalId: null,
          paymentMethod: "CASH",
          amountPaid: null,
          customerName: null,
        });
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to change customer type.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyPatch(patch: PosSessionPatch) {
    if (!session || busy || cartSaving) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await updateSession(patch);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to update the sale.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshRetailers() {
    const updated = await apiJson<Retailer[]>("/retailers");
    setRetailers(updated);
    return updated;
  }

  async function requestApproval() {
    if (
      !session?.retailer ||
      busy ||
      cartSaving ||
      Number(session.totalAmount) <= 0
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await apiJson(`/retailers/${session.retailer.id}/order-approval-requests`, {
        method: "POST",
        body: JSON.stringify({
          requestedAmount: session.totalAmount,
          reason: `POS credit sale at ${selectedCounter?.name ?? "sales counter"}.`,
        }),
      });
      await refreshRetailers();
      setNotice("Approval request sent to Admin.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to request approval.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function refreshApprovalStatus() {
    if (!session?.retailer || busy || cartSaving) {
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const updated = await refreshRetailers();
      const retailer =
        updated.find((item) => item.id === session.retailer?.id) ?? null;
      const approvals = validApprovedOrders(retailer);

      setNotice(
        approvals.length > 0
          ? "Admin approval received. Select it to continue."
          : "Approval is still pending with Admin.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to refresh approval status.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancelSale() {
    if (!session || busy || cartSaving) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      await apiJson(`/sessions/${session.id}/cancel`, { method: "POST" });
      pendingRef.current.clear();
      sessionIdRef.current = null;
      lastSyncedRef.current = null;
      setSession(null);
      setNotice("Sale cancelled.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to cancel the sale.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (
      !session ||
      session.items.length === 0 ||
      busy ||
      cartSaving ||
      !requireConnection()
    ) {
      return;
    }

    const printFrame = reserveReceiptPrintFrame();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const completed = await apiJson<PosSession>(
        `/sessions/${session.id}/checkout`,
        { method: "POST" },
      );
      const receipt = buildReceiptDocument({
        session: completed,
        terminalName: selectedCounter?.name,
      });
      setAvailability((current) => {
        const next = { ...current };
        for (const item of completed.items) {
          next[item.product.id] = Math.max(
            0,
            (next[item.product.id] ?? 0) - Number(item.quantity),
          );
        }
        return next;
      });
      setLastReceipt({ document: receipt, session: completed });
      pendingRef.current.clear();
      sessionIdRef.current = null;
      lastSyncedRef.current = null;
      setSession(null);
      void refreshRetailers().catch(() => undefined);
      setNotice(
        completed.completedSale?.saleNumber
          ? `Sale #${completed.completedSale.saleNumber} completed.`
          : "Checkout completed.",
      );
      printReceipt(receipt, printFrame);
    } catch (caught) {
      printFrame.remove();
      setError(
        caught instanceof Error ? caught.message : "Unable to complete checkout.",
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedPriceType = session?.priceType ?? "WALK_IN";
  const controlsBusy = busy || cartSaving;
  const adminProductDiscount = session
    ? configuredProductDiscountAmount(session)
    : 0;
  const paymentOptions: PaymentMethod[] =
    session?.customerType === "RETAILER"
      ? ["CASH", "TRANSFER", "POS", "CREDIT"]
      : ["CASH", "TRANSFER", "POS"];

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-[color:var(--border-muted)] bg-white p-4 shadow-[var(--shadow-whisper)]">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-56 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Sales counter
            <select
              className={fieldClass}
              disabled={Boolean(session) || controlsBusy}
              onChange={(event) => {
                storeCounterId(event.target.value);
              }}
              value={selectedCounterId}
            >
              {selectableCounterCount === 0 ? (
                <option value="">
                  {options.counters.length === 0
                    ? "No active counter"
                    : "No available counter"}
                </option>
              ) : null}
              {options.counters.map((counter) => {
                const occupiedByAnother = !counterIsSelectable(counter);
                const suffix = occupiedByAnother
                  ? ` (In use by ${counter.occupiedByName ?? "another cashier"})`
                  : counter.currentSessionId
                    ? " (Your active sale)"
                    : "";

                return (
                  <option
                    disabled={occupiedByAnother}
                    key={counter.id}
                    value={counter.id}
                  >
                    {counter.name || "Unnamed counter"}
                    {suffix}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="grid min-w-64 flex-1 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            Search products
            <span className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]"
              />
              <input
                className={`${fieldClass} w-full pl-9`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search products"
                type="search"
                value={query}
              />
            </span>
          </label>

          <div
            className={`inline-flex h-10 items-center gap-2 rounded-[5px] border px-3 text-sm font-medium ${
              isOnline
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {isOnline ? (
              <Wifi aria-hidden className="size-4" />
            ) : (
              <WifiOff aria-hidden className="size-4" />
            )}
            {isOnline ? "Online" : "Connection required"}
          </div>
        </div>

        {!isOnline ? (
          <p className="mt-3 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Sales are paused until this device can reach the bakery server.
          </p>
        ) : null}
        {options.counters.length === 0 ? (
          <p className="mt-3 rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Ask Admin to create and activate a sales counter before using POS.
          </p>
        ) : selectableCounterCount === 0 ? (
          <p className="mt-3 rounded-[5px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            All sales counters are currently in use. Ask a cashier to complete
            or cancel their sale, or ask Admin to create another counter.
          </p>
        ) : null}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filteredProducts.map((item) => {
          const available = availability[item.product.id] ?? 0;
          const price =
            productPriceForType(item.product, selectedPriceType) ?? "0";
          const walkInPrice =
            productPriceForType(item.product, "WALK_IN") ?? "0";
          const discountedPrice =
            productPriceForType(item.product, "DISCOUNTED") ?? "0";
          const discountPercent = Number(item.product.discountPercent ?? 0);
          // The discounted tier is only meaningful for individual (walk-in)
          // sales; retailer sales price off the retailer tier instead.
          const hasDiscount =
            selectedPriceType !== "RETAILER" &&
            discountPercent > 0 &&
            Number(discountedPrice) > 0 &&
            Number(discountedPrice) < Number(walkInPrice);
          const discountedActive = selectedPriceType === "DISCOUNTED";
          const unavailable =
            available <= 0 ||
            Number(price) <= 0 ||
            !selectedCounter ||
            !isOnline;

          return (
            <button
              className="min-h-32 rounded-lg border border-[color:var(--border-muted)] bg-white p-4 text-left shadow-[var(--shadow-whisper)] transition hover:border-[var(--brand-burgundy)] hover:bg-[var(--surface-warm)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={unavailable || busy}
              key={item.product.id}
              onClick={() => enqueueQuantity(item, (current) => current + 1)}
              type="button"
            >
              <p className="font-semibold text-[var(--text-primary)]">
                {formatProductName(item.product)}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {formatQuantity(available, item.product.unit.abbreviation)} available
              </p>
              {hasDiscount ? (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span
                    className={
                      discountedActive
                        ? "text-sm text-[var(--text-muted)] line-through"
                        : "font-semibold text-[var(--brand-burgundy)]"
                    }
                  >
                    {formatMoney(walkInPrice)}
                  </span>
                  <span
                    className={
                      discountedActive
                        ? "font-semibold text-[var(--brand-burgundy)]"
                        : "text-sm font-semibold text-emerald-700"
                    }
                  >
                    {formatMoney(discountedPrice)}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
                    -{discountPercent}% {discountedActive ? "applied" : "discount"}
                  </span>
                </div>
              ) : (
                <p className="mt-3 font-semibold text-[var(--brand-burgundy)]">
                  {formatMoney(price)}
                </p>
              )}
            </button>
          );
        })}
      </section>

      <section className="rounded-lg border border-[color:var(--border-muted)] bg-white p-4 shadow-[var(--shadow-whisper)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Current sale
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {session ? "Active" : "Select a product to begin"}
            </p>
          </div>
          {session ? (
            <button
              aria-label="Cancel current sale"
              className={iconButtonClass}
              disabled={controlsBusy}
              onClick={() => void cancelSale()}
              title="Cancel sale"
              type="button"
            >
              <X aria-hidden className="size-4" />
            </button>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="mt-4 rounded-[5px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {notice}
          </p>
        ) : null}

        {selectedCounter ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] p-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">
                Customer display
              </p>
              <p className="mt-0.5 max-w-3xl truncate text-xs text-[var(--text-muted)]">
                {displayUrl}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                aria-label="Copy customer display link"
                className={iconButtonClass}
                onClick={() => void copyText(displayUrl)}
                title="Copy display link"
                type="button"
              >
                <Copy aria-hidden className="size-4" />
              </button>
              <a
                aria-label="Open customer display"
                className={iconButtonClass}
                href={displayUrl}
                rel="noreferrer"
                target="_blank"
                title="Open customer display"
              >
                <ExternalLink aria-hidden className="size-4" />
              </a>
            </div>
          </div>
        ) : null}

        {!session ? (
          <div className="mt-4 grid min-h-32 place-items-center rounded-[5px] border border-dashed border-[color:var(--border-muted)] text-sm text-[var(--text-muted)]">
            Select a product to start the sale.
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Customer type
                <select
                  className={fieldClass}
                  disabled={controlsBusy}
                  onChange={(event) =>
                    void handleCustomerType(event.target.value as CustomerType)
                  }
                  value={session.customerType}
                >
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="RETAILER">Retailer</option>
                </select>
              </label>

              {session.customerType === "RETAILER" ? (
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Retailer
                  <select
                    className={fieldClass}
                    disabled={controlsBusy}
                    onChange={(event) =>
                      void applyPatch({
                        retailerId: event.target.value,
                        retailerApprovalId: null,
                      })
                    }
                    value={session.retailer?.id ?? ""}
                  >
                    {retailers
                      .filter((retailer) => retailer.isActive)
                      .map((retailer) => (
                        <option key={retailer.id} value={retailer.id}>
                          {retailer.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Customer name
                  <input
                    className={fieldClass}
                    defaultValue={session.customerName ?? ""}
                    disabled={controlsBusy}
                    key={`customer-${session.id}-${session.customerName ?? ""}`}
                    onBlur={(event) =>
                      void applyPatch({
                        customerName: event.target.value.trim() || null,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>
              )}

              {session.customerType === "INDIVIDUAL" ? (
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Price
                  <select
                    className={fieldClass}
                    disabled={controlsBusy}
                    onChange={(event) =>
                      void applyPatch({
                        priceType: event.target.value as SalePriceType,
                      })
                    }
                    value={session.priceType}
                  >
                    <option value="WALK_IN">Walk-in</option>
                    <option value="DISCOUNTED">
                      Discounted (Admin rates)
                    </option>
                  </select>
                </label>
              ) : (
                <div className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Price
                  <div className={`${fieldClass} flex items-center`}>
                    {salePriceLabel(session.priceType)}
                  </div>
                </div>
              )}

              <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                Payment
                <select
                  className={fieldClass}
                  disabled={controlsBusy}
                  onChange={(event) => {
                    const method = event.target.value as PaymentMethod;
                    void applyPatch({
                      paymentMethod: method,
                      amountPaid: method === "CREDIT" ? "0" : null,
                      retailerApprovalId:
                        method === "CREDIT"
                          ? session.retailerApprovalId
                          : null,
                    });
                  }}
                  value={session.paymentMethod}
                >
                  {paymentOptions.map((method) => (
                    <option key={method} value={method}>
                      {paymentLabels[method]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {session.customerType === "RETAILER" &&
            session.paymentMethod === "CREDIT" &&
            activeRetailer?.requiresOrderApproval ? (
              <div className="mt-3 rounded-[5px] border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-950">
                  Admin approval required
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900">
                  This retailer has {formatMoney(activeRetailer.outstandingBalance)}{" "}
                  in uncleared credit.
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {approvedOrders.length > 0 ? (
                    <label className="grid min-w-64 gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-amber-900">
                      Approved order
                      <select
                        className={fieldClass}
                        disabled={controlsBusy}
                        onChange={(event) =>
                          void applyPatch({
                            retailerApprovalId: event.target.value || null,
                          })
                        }
                        value={session.retailerApprovalId ?? ""}
                      >
                        <option value="">Select approval</option>
                        {approvedOrders.map((approval) => (
                          <option key={approval.id} value={approval.id}>
                            {formatMoney(approval.approvedAmount)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <button
                      className="inline-flex h-10 items-center justify-center rounded-[5px] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={
                        controlsBusy || Number(session.totalAmount) <= 0
                      }
                      onClick={() =>
                        void (hasPendingApprovalRequest
                          ? refreshApprovalStatus()
                          : requestApproval())
                      }
                      type="button"
                    >
                      {hasPendingApprovalRequest
                        ? "Refresh approval status"
                        : "Request Admin approval"}
                    </button>
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-4 divide-y divide-[color:var(--border-muted)] rounded-lg border border-[color:var(--border-muted)]">
              {session.items.map((entry) => {
                const inventory = options.products.find(
                  (item) => item.product.id === entry.product.id,
                );
                const maximum = availability[entry.product.id] ?? 0;

                return (
                  <div
                    className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    key={entry.id}
                  >
                    <div>
                      <p className="font-semibold text-[var(--text-primary)]">
                        {formatProductName(entry.product)}
                      </p>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        {formatMoney(entry.unitPrice)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        aria-label={`Reduce ${formatProductName(entry.product)}`}
                        className={iconButtonClass}
                        disabled={busy}
                        onClick={() =>
                          inventory &&
                          enqueueQuantity(inventory, (current) => current - 1)
                        }
                        type="button"
                      >
                        <Minus aria-hidden className="size-4" />
                      </button>
                      <QuantityInput
                        key={`${entry.id}-${entry.quantity}`}
                        busy={busy}
                        entry={entry}
                        maximum={maximum}
                        onCommit={(quantity) => {
                          if (inventory) {
                            enqueueQuantity(inventory, () => quantity);
                          }
                        }}
                      />
                      <button
                        aria-label={`Increase ${formatProductName(entry.product)}`}
                        className={iconButtonClass}
                        disabled={busy || Number(entry.quantity) >= maximum}
                        onClick={() =>
                          inventory &&
                          enqueueQuantity(inventory, (current) => current + 1)
                        }
                        type="button"
                      >
                        <Plus aria-hidden className="size-4" />
                      </button>
                      <button
                        aria-label={`Remove ${formatProductName(entry.product)}`}
                        className={iconButtonClass}
                        disabled={busy}
                        onClick={() =>
                          inventory && enqueueQuantity(inventory, () => 0)
                        }
                        title="Remove"
                        type="button"
                      >
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                    <p className="text-right font-semibold text-[var(--text-primary)]">
                      {formatMoney(entry.lineTotal)}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Amount paid
                  <input
                    className={fieldClass}
                    defaultValue={session.amountPaid}
                    disabled={controlsBusy}
                    key={`paid-${session.id}-${session.amountPaid}`}
                    min="0"
                    onBlur={(event) =>
                      void applyPatch({ amountPaid: event.target.value || "0" })
                    }
                    step="0.01"
                    type="number"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Notes
                  <textarea
                    className="min-h-20 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
                    defaultValue={session.notes ?? ""}
                    disabled={controlsBusy}
                    key={`notes-${session.id}-${session.notes ?? ""}`}
                    onBlur={(event) =>
                      void applyPatch({
                        notes: event.target.value.trim() || null,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-[color:var(--border-muted)] bg-[var(--surface-warm)] p-4">
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Subtotal</span>
                    <span>{formatMoney(session.subtotal)}</span>
                  </div>
                  {adminProductDiscount > 0 ? (
                    <div className="flex justify-between text-[var(--text-secondary)]">
                      <span>Admin product discount</span>
                      <span>{formatMoney(adminProductDiscount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-[color:var(--border-muted)] pt-3 text-lg font-semibold text-[var(--text-primary)]">
                    <span>Total</span>
                    <span>{formatMoney(session.totalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-[var(--text-secondary)]">
                    <span>Paid</span>
                    <span>{formatMoney(session.amountPaid)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-[var(--brand-burgundy)]">
                    <span>Balance</span>
                    <span>{formatMoney(session.balanceDue)}</span>
                  </div>
                </div>
                <button
                  className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[5px] bg-[var(--brand-burgundy)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--brand-burgundy-dark)] disabled:cursor-not-allowed disabled:bg-stone-300"
                  disabled={
                    busy ||
                    cartSaving ||
                    !isOnline ||
                    session.items.length === 0 ||
                    (session.customerType === "RETAILER" &&
                      session.paymentMethod === "CREDIT" &&
                      Boolean(activeRetailer?.requiresOrderApproval) &&
                      !session.retailerApprovalId)
                  }
                  onClick={() => void checkout()}
                  type="button"
                >
                  {busy ? (
                    <>
                      <Spinner />
                      Processing
                    </>
                  ) : (
                    <>
                      <Printer aria-hidden className="size-4" />
                      Checkout and print
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {lastReceipt ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div>
            <p className="font-semibold text-emerald-950">
              Sale #{lastReceipt.session.completedSale?.saleNumber} completed
            </p>
            <p className="mt-1 text-sm text-emerald-800">
              {formatMoney(lastReceipt.session.totalAmount)} ·{" "}
              {paymentLabels[lastReceipt.session.paymentMethod]}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              className={iconButtonClass}
              onClick={() => printReceipt(lastReceipt.document)}
              title="Print receipt again"
              type="button"
            >
              <Printer aria-hidden className="size-4" />
            </button>
            <button
              className={iconButtonClass}
              onClick={() => downloadReceipt(lastReceipt.document)}
              title="Download receipt"
              type="button"
            >
              <Download aria-hidden className="size-4" />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
