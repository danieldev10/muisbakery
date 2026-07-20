"use client";

import {
  Check,
  Copy,
  Download,
  Minus,
  MonitorUp,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CustomerType,
  PaymentMethod,
  PosOfflineQueuedSale,
  PosOfflineSnapshot,
  PosOfflineSyncResponse,
  PairedPosTerminal,
  PosSession,
  PosTerminal as PosTerminalRecord,
  Retailer,
  SalesInventoryItem,
  SalesOptions,
} from "@/lib/operations/types";
import {
  POS_SHELL_STATUS_EVENT,
  requestPosShellStatus,
  type PosShellStatus,
} from "@/lib/pos-shell";
import { formatProductName } from "@/lib/product-label";
import { Spinner } from "@/components/spinner";
import {
  apiJson,
  buildPosDisplayPreview,
  calculateSessionTotals,
  CART_SYNC_DELAY_MS,
  buildOfflineSalePayload,
  createUuid,
  fieldClass,
  formatMoney,
  formatQuantity,
  iconButtonClass,
  createLocalPosSession,
  paymentLabels,
  productAvailable,
  roundCount,
  updateSessionProductQuantity,
  type PosSessionPatch,
} from "./_lib/pos-terminal-helpers";
import {
  addQueuedOfflineSale,
  clearActiveOfflineSession,
  listQueuedOfflineSales,
  loadActiveOfflineSession,
  loadOfflineSnapshot,
  saveActiveOfflineSession,
  saveOfflineSnapshot,
  unresolvedOfflineSales,
  updateQueuedOfflineSale,
} from "./_lib/offline-pos-store";
import { deriveOfflineRetailers } from "./_lib/offline-retailer-credit";

type ReceiptDocument = {
  filename: string;
  html: string;
  text: string;
};

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

// The printed receipt is for the customer: totals and purchase details only,
// never system state like sync/queue status. Cashier-facing state stays on
// screen.
function buildReceiptDocument({
  session,
  terminalName,
  saleNumber,
}: {
  session: PosSession;
  terminalName: string | null | undefined;
  saleNumber?: number | null;
}): ReceiptDocument {
  const resolvedSaleNumber =
    session.completedSale?.saleNumber ?? saleNumber ?? null;
  const saleLabel = resolvedSaleNumber ? `#${resolvedSaleNumber}` : null;
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
    `Terminal: ${terminalName ?? "POS terminal"}`,
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
            <p><strong>Terminal:</strong> ${escapeHtml(terminalName ?? "POS terminal")}</p>
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

  const cleanup = () => {
    receiptFrame.remove();
  };

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

export function PosTerminal({ options }: { options: SalesOptions }) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [terminal, setTerminal] = useState<PosTerminalRecord | null>(null);
  const [query, setQuery] = useState("");
  const [retailers, setRetailers] = useState(options.retailers);
  const [error, setError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [posShellStatus, setPosShellStatus] =
    useState<PosShellStatus | null>(null);
  const [offlineSnapshot, setOfflineSnapshot] =
    useState<PosOfflineSnapshot | null>(null);
  const [queuedOfflineSales, setQueuedOfflineSales] = useState<
    PosOfflineQueuedSale[]
  >([]);
  const [lastReceipt, setLastReceipt] = useState<ReceiptDocument | null>(null);
  const [approvalRequestBusy, setApprovalRequestBusy] = useState(false);
  const [approvalRequestSent, setApprovalRequestSent] = useState(false);
  const [cartSyncCount, setCartSyncCount] = useState(0);
  const [sessionPatchBusy, setSessionPatchBusy] = useState(false);
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [terminalSetupId, setTerminalSetupId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem("muisbakery.posTerminalId") ?? ""),
  );
  const [terminalPairingCode, setTerminalPairingCode] = useState("");
  const [customerType, setCustomerType] =
    useState<CustomerType>("INDIVIDUAL");
  const [retailerId, setRetailerId] = useState("");
  const [retailerApprovalId, setRetailerApprovalId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const terminalRef = useRef<PosTerminalRecord | null>(null);
  const terminalLoadPromiseRef = useRef<Promise<PosTerminalRecord | null> | null>(
    null,
  );
  const sessionRef = useRef<PosSession | null>(null);
  const sessionStartPromiseRef = useRef<Promise<PosSession | null> | null>(null);
  const sessionPatchQueueRef = useRef<Promise<void>>(Promise.resolve());
  const sessionPatchCountRef = useRef(0);
  const nextCartSyncIdRef = useRef(1);
  const cartSyncsRef = useRef(
    new Map<
      string,
      {
        item: SalesInventoryItem;
        quantity: number;
        requestId: number;
        sessionId: string;
        timeout: ReturnType<typeof setTimeout>;
      }
    >(),
  );

  const applySession = useCallback(
    (nextSession: PosSession | null, syncDetails = true) => {
      sessionRef.current = nextSession;
      setSession(nextSession);

      if (!syncDetails) {
        return;
      }

      setPaymentMethod(nextSession?.paymentMethod ?? "CASH");
      setCustomerType(nextSession?.customerType ?? "INDIVIDUAL");
      setRetailerId(nextSession?.retailer?.id ?? "");
      setRetailerApprovalId(nextSession?.retailerApprovalId ?? "");
    },
    [],
  );

  const applyTerminal = useCallback((nextTerminal: PosTerminalRecord | null) => {
    terminalRef.current = nextTerminal;
    setTerminal(nextTerminal);
  }, []);

  const ensureTerminal = useCallback(async () => {
    if (terminalRef.current) {
      return terminalRef.current;
    }

    if (terminalLoadPromiseRef.current) {
      return terminalLoadPromiseRef.current;
    }

    terminalLoadPromiseRef.current = (async () => {
      const existingId = window.localStorage.getItem("muisbakery.posTerminalId");
      const existingSecret = window.localStorage.getItem(
        "muisbakery.posTerminalSecret",
      );

      if (existingId && existingSecret) {
        try {
          const loaded = await apiJson<PosTerminalRecord>(
            `/terminals/${existingId}`,
          );
          applyTerminal(loaded);
          return loaded;
        } catch (caught) {
          const cached = await loadOfflineSnapshot(existingId).catch(() => null);

          if (cached) {
            setOfflineSnapshot(cached);
            applyTerminal(cached.terminal);
            return cached.terminal;
          }

          if (navigator.onLine) {
            window.localStorage.removeItem("muisbakery.posTerminalId");
            window.localStorage.removeItem("muisbakery.posTerminalSecret");
            setTerminalSetupId("");
          }

          throw caught;
        }
      }

      throw new Error(
        "This device is not paired to a POS terminal. Ask Admin for the terminal setup ID and pairing code.",
      );
    })();

    try {
      return await terminalLoadPromiseRef.current;
    } finally {
      terminalLoadPromiseRef.current = null;
    }
  }, [applyTerminal]);

  function refreshCartSyncCount() {
    setCartSyncCount(cartSyncsRef.current.size);
  }

  function clearCartSyncs() {
    for (const entry of cartSyncsRef.current.values()) {
      clearTimeout(entry.timeout);
    }
    cartSyncsRef.current.clear();
    refreshCartSyncCount();
  }

  const refreshQueuedSales = useCallback(async (terminalId = terminalRef.current?.id) => {
    if (!terminalId) {
      setQueuedOfflineSales([]);
      return [];
    }

    const records = await listQueuedOfflineSales(terminalId);

    setQueuedOfflineSales(records);
    return records;
  }, []);

  const prepareOfflineSnapshot = useCallback(async (
    currentTerminal: PosTerminalRecord,
    allowNetwork = true,
  ) => {
    if (!currentTerminal.offlineEnabled) {
      setOfflineSnapshot(null);
      return null;
    }

    if (allowNetwork && navigator.onLine) {
      const snapshot = await apiJson<PosOfflineSnapshot>(
        `/terminals/${currentTerminal.id}/offline-snapshot`,
      );

      await saveOfflineSnapshot(snapshot);
      setOfflineSnapshot(snapshot);
      applyTerminal(snapshot.terminal);
      return snapshot;
    }

    const cached = await loadOfflineSnapshot(currentTerminal.id);

    if (!cached) {
      throw new Error(
        "This POS terminal has no offline snapshot yet. Connect to the internet once before selling offline.",
      );
    }

    setOfflineSnapshot(cached);
    applyTerminal(cached.terminal);
    return cached;
  }, [applyTerminal]);

  const loadOfflineState = useCallback(async (currentTerminal: PosTerminalRecord) => {
    const snapshot = await prepareOfflineSnapshot(
      currentTerminal,
      navigator.onLine,
    );
    const activeSession = await loadActiveOfflineSession(currentTerminal.id);

    if (activeSession) {
      applySession(activeSession);
    }

    await refreshQueuedSales(currentTerminal.id);

    return snapshot;
  }, [applySession, prepareOfflineSnapshot, refreshQueuedSales]);

  const confirmDayCloseReadiness = useCallback(
    async (snapshot: PosOfflineSnapshot | null, pendingSaleCount: number) => {
      const barrier = snapshot?.dayCloseBarrier;

      if (
        !snapshot ||
        !barrier ||
        barrier.status !== "CLOSING" ||
        !barrier.cutoffAt ||
        barrier.terminalConfirmed ||
        pendingSaleCount !== 0
      ) {
        return snapshot;
      }

      await apiJson(
        `/terminals/${snapshot.terminal.id}/day-close-readiness`,
        {
          method: "POST",
          body: JSON.stringify({
            date: barrier.businessDate,
            cutoffAt: barrier.cutoffAt,
            pendingSaleCount: 0,
          }),
        },
      );

      const confirmedSnapshot: PosOfflineSnapshot = {
        ...snapshot,
        dayCloseBarrier: { ...barrier, terminalConfirmed: true },
      };
      await saveOfflineSnapshot(confirmedSnapshot);
      setOfflineSnapshot(confirmedSnapshot);
      return confirmedSnapshot;
    },
    [],
  );

  async function claimTerminal() {
    const setupId = terminalSetupId.trim();
    const pairingCode = terminalPairingCode.trim();

    if (!setupId) {
      setError("Enter the POS terminal setup ID from Admin.");
      return;
    }

    if (!pairingCode) {
      setError("Enter the POS terminal pairing code from Admin.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const loaded = await apiJson<PairedPosTerminal>("/terminals/pair", {
        method: "POST",
        body: JSON.stringify({ terminalId: setupId, pairingCode }),
      });

      window.localStorage.setItem("muisbakery.posTerminalId", loaded.id);
      window.localStorage.setItem(
        "muisbakery.posTerminalSecret",
        loaded.deviceSecret,
      );
      setTerminalSetupId(loaded.id);
      setTerminalPairingCode("");
      applyTerminal(loaded);
      if (loaded.offlineEnabled) {
        await loadOfflineState(loaded);
      }
    } catch (caught) {
      window.localStorage.removeItem("muisbakery.posTerminalId");
      window.localStorage.removeItem("muisbakery.posTerminalSecret");
      applyTerminal(null);
      setError(
        caught instanceof Error ? caught.message : "Unable to pair terminal.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function handlePosShellStatus(event: Event) {
      setPosShellStatus((event as CustomEvent<PosShellStatus>).detail);
    }

    window.addEventListener(POS_SHELL_STATUS_EVENT, handlePosShellStatus);

    const worker = navigator.serviceWorker?.controller;

    if (worker) {
      void requestPosShellStatus(worker, "CHECK_POS_SHELL")
        .then(setPosShellStatus)
        .catch((caught) => {
          setPosShellStatus({
            ready: false,
            message:
              caught instanceof Error
                ? caught.message
                : "Unable to check the offline POS shell.",
          });
        });
    }

    return () => {
      window.removeEventListener(POS_SHELL_STATUS_EVENT, handlePosShellStatus);
    };
  }, []);

  useEffect(() => {
    const cartSyncs = cartSyncsRef.current;

    void ensureTerminal()
      .then(async (loadedTerminal) => {
        if (!loadedTerminal) {
          return;
        }

        if (loadedTerminal.offlineEnabled) {
          await loadOfflineState(loadedTerminal);
          return;
        }

        const existingId = window.localStorage.getItem("muisbakery.posSessionId");

        if (!existingId) {
          return;
        }

        await apiJson<PosSession>(`/sessions/${existingId}`)
          .then((loaded) => {
            if (loaded.status === "ACTIVE") {
              applySession(loaded);
            } else {
              window.localStorage.removeItem("muisbakery.posSessionId");
            }
          })
          .catch(() => {
            window.localStorage.removeItem("muisbakery.posSessionId");
          });
      })
      .catch((caught) => {
        void (async () => {
          const existingId = window.localStorage.getItem(
            "muisbakery.posTerminalId",
          );

          if (existingId) {
            const cached = await loadOfflineSnapshot(existingId).catch(
              () => null,
            );

            if (cached) {
              applyTerminal(cached.terminal);
              setOfflineSnapshot(cached);
              const activeSession = await loadActiveOfflineSession(existingId);
              if (activeSession) {
                applySession(activeSession);
              }
              await refreshQueuedSales(existingId);
              setError(null);
              return;
            }
          }

          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to prepare POS terminal.",
          );
        })();
      });

    return () => {
      for (const entry of cartSyncs.values()) {
        clearTimeout(entry.timeout);
      }
      cartSyncs.clear();
    };
  }, [
    applySession,
    applyTerminal,
    ensureTerminal,
    loadOfflineState,
    refreshQueuedSales,
  ]);

  const terminalStockByProductId = useMemo(() => {
    return new Map(
      terminal?.stockAllocations.map((allocation) => [
        allocation.product.id,
        allocation,
      ]) ?? [],
    );
  }, [terminal]);
  const unresolvedQueuedSales = useMemo(
    () =>
      queuedOfflineSales.filter(
        (sale) =>
          sale.status === "PENDING" ||
          sale.status === "SYNCING" ||
          sale.status === "FAILED" ||
          sale.status === "CONFLICT",
      ),
    [queuedOfflineSales],
  );
  const availableRetailers = useMemo(
    () =>
      terminal?.offlineEnabled && offlineSnapshot
        ? deriveOfflineRetailers(offlineSnapshot, unresolvedQueuedSales)
        : retailers,
    [offlineSnapshot, retailers, terminal?.offlineEnabled, unresolvedQueuedSales],
  );
  const offlineQueuedQuantityByProductId = useMemo(() => {
    const quantities = new Map<string, number>();

    for (const sale of unresolvedQueuedSales) {
      for (const item of sale.payload.items) {
        quantities.set(
          item.productId,
          (quantities.get(item.productId) ?? 0) + Number(item.quantity),
        );
      }
    }

    return quantities;
  }, [unresolvedQueuedSales]);

  const productAvailability = useCallback(
    (item: SalesInventoryItem) => {
      const globalAvailable = productAvailable(item);

      if (!terminal?.offlineEnabled) {
        return globalAvailable;
      }

      const allocation = terminalStockByProductId.get(item.product.id);

      if (!allocation) {
        return 0;
      }

      const queuedQuantity =
        offlineQueuedQuantityByProductId.get(item.product.id) ?? 0;
      const localRemaining = Math.max(
        0,
        Number(allocation.remainingQuantity) - queuedQuantity,
      );

      return Math.min(globalAvailable, localRemaining);
    },
    [offlineQueuedQuantityByProductId, terminal?.offlineEnabled, terminalStockByProductId],
  );

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();
    const products =
      terminal?.offlineEnabled && offlineSnapshot
        ? offlineSnapshot.products.map((entry) => entry.inventory)
        : options.products;

    return products.filter((item) => {
      if (productAvailability(item) <= 0) {
        return false;
      }
      if (!search) {
        return true;
      }
      return formatProductName(item.product).toLowerCase().includes(search);
    });
  }, [offlineSnapshot, options.products, productAvailability, query, terminal?.offlineEnabled]);
  const productSource =
    terminal?.offlineEnabled && offlineSnapshot
      ? offlineSnapshot.products.map((entry) => entry.inventory)
      : options.products;

  const selectedRetailer: Retailer | null =
    availableRetailers.find((retailer) => retailer.id === retailerId) ??
    session?.retailer ??
    null;
  const selectedApproval =
    selectedRetailer?.orderApprovals.find(
      (approval) => approval.id === retailerApprovalId,
    ) ?? null;
  const pendingApprovalRequest =
    selectedRetailer?.orderApprovalRequests.find(
      (approval) => approval.status === "PENDING",
    ) ?? null;
  const retailerSelectionMissing =
    customerType === "RETAILER" && retailerId.trim() === "";
  const retailerApprovalMissing =
    customerType === "RETAILER" &&
    paymentMethod === "CREDIT" &&
    Boolean(selectedRetailer?.requiresOrderApproval) &&
    retailerApprovalId.trim() === "";
  const displayUrl =
    terminal && origin
      ? `${origin}/customer-display/terminal/${terminal.displayToken}`
      : "";
  const cartIsSyncing = cartSyncCount > 0;
  const offlineEnabled = Boolean(terminal?.offlineEnabled);
  const failedOfflineCount = unresolvedQueuedSales.filter(
    (sale) => sale.status === "FAILED" || sale.status === "CONFLICT",
  ).length;
  const syncedOfflineCount = queuedOfflineSales.filter(
    (sale) => sale.status === "SYNCED" || sale.status === "DUPLICATE",
  ).length;

  async function startSession() {
    if (sessionRef.current?.status === "ACTIVE") {
      return sessionRef.current;
    }

    if (sessionStartPromiseRef.current) {
      return sessionStartPromiseRef.current;
    }

    setBusy(true);
    setError(null);

    sessionStartPromiseRef.current = (async () => {
      try {
        const currentTerminal = await ensureTerminal();

        if (currentTerminal?.offlineEnabled) {
          await prepareOfflineSnapshot(currentTerminal, navigator.onLine).catch(
            () => null,
          );
          const createdAt = new Date().toISOString();
          const created = createLocalPosSession({
            id: `offline-session-${createUuid()}`,
            terminalId: currentTerminal.id,
            terminalDisplayToken: currentTerminal.displayToken,
            createdAt,
          });

          await saveActiveOfflineSession(currentTerminal.id, created);
          clearCartSyncs();
          applySession(created);
          return created;
        }

        const created = await apiJson<PosSession>("/sessions", {
          method: "POST",
          body: JSON.stringify({ terminalId: currentTerminal?.id }),
        });

        window.localStorage.setItem("muisbakery.posSessionId", created.id);
        if (currentTerminal) {
          applyTerminal({ ...currentTerminal, currentSession: created });
        }
        clearCartSyncs();
        applySession(created);
        return created;
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Unable to start sale.",
        );
        return null;
      } finally {
        sessionStartPromiseRef.current = null;
        setBusy(false);
      }
    })();

    return sessionStartPromiseRef.current;
  }

  async function patchSession(patch: PosSessionPatch) {
    const currentTerminal = terminalRef.current;

    if (currentTerminal?.offlineEnabled) {
      sessionPatchCountRef.current += 1;
      setSessionPatchBusy(true);

      const operation = sessionPatchQueueRef.current.then(async () => {
        const currentSession = sessionRef.current;

        if (!currentSession || currentSession.status !== "ACTIVE") {
          return;
        }

        const nextCustomerType =
          patch.customerType ?? currentSession.customerType;
        const nextPaymentMethod =
          patch.paymentMethod ?? currentSession.paymentMethod;
        const nextAmountPaid =
          patch.amountPaid !== undefined
            ? patch.amountPaid ?? "0.00"
            : patch.paymentMethod !== undefined &&
                patch.paymentMethod !== currentSession.paymentMethod
              ? nextPaymentMethod === "CREDIT"
                ? "0.00"
                : currentSession.totalAmount
              : currentSession.amountPaid;
        const nextRetailer =
          nextCustomerType === "RETAILER"
            ? availableRetailers.find(
                (retailer) =>
                  retailer.id ===
                  (patch.retailerId === undefined
                    ? currentSession.retailer?.id
                    : patch.retailerId),
              ) ?? currentSession.retailer
            : null;
        const nextSession = calculateSessionTotals({
          ...currentSession,
          customerType: nextCustomerType,
          retailer: nextRetailer,
          retailerApprovalId:
            nextCustomerType === "RETAILER"
              ? patch.retailerApprovalId === undefined
                ? currentSession.retailerApprovalId
                : patch.retailerApprovalId
              : null,
          customerName:
            nextCustomerType === "RETAILER"
              ? nextRetailer?.name ?? null
              : patch.customerName === undefined
                ? currentSession.customerName
                : patch.customerName,
          paymentMethod: nextPaymentMethod,
          discount: patch.discount ?? currentSession.discount,
          amountPaid: nextAmountPaid,
          notes:
            patch.notes === undefined ? currentSession.notes : patch.notes,
          updatedAt: new Date().toISOString(),
        });

        applySession(nextSession);
        await saveActiveOfflineSession(currentTerminal.id, nextSession);
      });

      sessionPatchQueueRef.current = operation.catch(() => undefined);

      try {
        await operation;
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to save the offline sale details.",
        );
      } finally {
        sessionPatchCountRef.current -= 1;

        if (sessionPatchCountRef.current === 0) {
          setSessionPatchBusy(false);
        }
      }
      return;
    }

    const currentSession = sessionRef.current;

    if (!currentSession || currentSession.status !== "ACTIVE") {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const updated = await apiJson<PosSession>(
        `/sessions/${currentSession.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(patch),
        },
      );

      applySession(updated);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update sale.");
    } finally {
      setBusy(false);
    }
  }

  async function changeCustomerType(nextType: CustomerType) {
    setCustomerType(nextType);
    setApprovalRequestSent(false);

    if (nextType === "INDIVIDUAL") {
      setRetailerId("");
      setRetailerApprovalId("");
      setPaymentMethod("CASH");
      await patchSession({
        customerType: "INDIVIDUAL",
        retailerId: null,
        retailerApprovalId: null,
        paymentMethod: "CASH",
      });
      return;
    }

    const nextRetailer = selectedRetailer ?? availableRetailers[0] ?? null;
    const nextApprovalId = nextRetailer?.requiresOrderApproval
      ? nextRetailer.orderApprovals[0]?.id ?? ""
      : "";

    setRetailerId(nextRetailer?.id ?? "");
    setRetailerApprovalId(nextApprovalId);
    setPaymentMethod("CREDIT");
    await patchSession({
      customerType: "RETAILER",
      retailerId: nextRetailer?.id ?? null,
      retailerApprovalId: nextApprovalId || null,
      paymentMethod: "CREDIT",
    });
  }

  async function changeRetailer(nextRetailerId: string) {
    const nextRetailer =
      availableRetailers.find(
        (retailer) => retailer.id === nextRetailerId,
      ) ??
      null;
    const nextApprovalId = nextRetailer?.requiresOrderApproval
      ? nextRetailer.orderApprovals[0]?.id ?? ""
      : "";

    setCustomerType("RETAILER");
    setRetailerId(nextRetailerId);
    setRetailerApprovalId(nextApprovalId);
    setApprovalRequestSent(false);
    setPaymentMethod("CREDIT");
    await patchSession({
      customerType: "RETAILER",
      retailerId: nextRetailerId || null,
      retailerApprovalId: nextApprovalId || null,
      paymentMethod: "CREDIT",
    });
  }

  async function changeRetailerApproval(nextApprovalId: string) {
    setRetailerApprovalId(nextApprovalId);
    await patchSession({
      customerType: "RETAILER",
      retailerId: retailerId || null,
      retailerApprovalId: nextApprovalId || null,
      paymentMethod: "CREDIT",
    });
  }

  async function refreshRetailers() {
    const updatedRetailers = await apiJson<Retailer[]>("/retailers");

    setRetailers(updatedRetailers);

    return updatedRetailers;
  }

  async function requestAdminApproval() {
    if (!selectedRetailer || !session) {
      return;
    }

    setApprovalRequestBusy(true);
    setApprovalRequestSent(false);
    setError(null);

    try {
      await apiJson(`/retailers/${selectedRetailer.id}/order-approval-requests`, {
        method: "POST",
        body: JSON.stringify({
          requestedAmount: session.totalAmount,
          terminalId: terminal?.id,
          reason: `POS request for retailer credit sale of ${formatMoney(
            session.totalAmount,
          )}.`,
        }),
      });
      await refreshRetailers();
      setApprovalRequestSent(true);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to request Admin approval.",
      );
    } finally {
      setApprovalRequestBusy(false);
    }
  }

  function queueCartSync(
    current: PosSession,
    item: SalesInventoryItem,
    quantity: number,
  ) {
    const productId = item.product.id;
    const existing = cartSyncsRef.current.get(productId);

    if (existing) {
      clearTimeout(existing.timeout);
    }

    const requestId = nextCartSyncIdRef.current;
    nextCartSyncIdRef.current += 1;

    const timeout = setTimeout(() => {
      void syncCartItem(productId, requestId);
    }, CART_SYNC_DELAY_MS);

    cartSyncsRef.current.set(productId, {
      item,
      quantity,
      requestId,
      sessionId: current.id,
      timeout,
    });
    refreshCartSyncCount();
  }

  async function syncCartItem(productId: string, requestId: number) {
    const pending = cartSyncsRef.current.get(productId);

    if (!pending || pending.requestId !== requestId) {
      return;
    }

    try {
      const updated = await apiJson<PosSession>(
        `/sessions/${pending.sessionId}/items`,
        {
          method: "PATCH",
          body: JSON.stringify({
            productId,
            quantity: pending.quantity,
            unitPrice: pending.item.product.unitPrice,
          }),
        },
      );
      const latest = cartSyncsRef.current.get(productId);

      if (!latest || latest.requestId !== requestId) {
        return;
      }

      cartSyncsRef.current.delete(productId);
      refreshCartSyncCount();

      if (cartSyncsRef.current.size === 0) {
        applySession(updated, false);
        window.localStorage.setItem("muisbakery.posSessionId", updated.id);
        return;
      }

      const current = sessionRef.current;

      if (!current || current.id !== updated.id) {
        applySession(updated, false);
        window.localStorage.setItem("muisbakery.posSessionId", updated.id);
        return;
      }

      const syncedItem = updated.items.find(
        (entry) => entry.product.id === productId,
      );
      const nextItems = current.items.filter(
        (entry) => entry.product.id !== productId,
      );

      if (syncedItem) {
        nextItems.push(syncedItem);
      }

      applySession(calculateSessionTotals({ ...current, items: nextItems }), false);
      window.localStorage.setItem("muisbakery.posSessionId", updated.id);
    } catch (caught) {
      const latest = cartSyncsRef.current.get(productId);

      if (!latest || latest.requestId !== requestId) {
        return;
      }

      cartSyncsRef.current.delete(productId);
      refreshCartSyncCount();
      setError(caught instanceof Error ? caught.message : "Unable to update cart.");

      void apiJson<PosSession>(`/sessions/${pending.sessionId}`)
        .then((loaded) => {
          applySession(loaded, false);
        })
        .catch(() => undefined);
    }
  }

  async function setProductQuantity(item: SalesInventoryItem, quantity: number) {
    let current = sessionRef.current;

    if (!current) {
      current = await startSession();
    }

    if (!current || current.status !== "ACTIVE") {
      return;
    }

    const available = productAvailability(item);
    const nextQuantity = roundCount(Math.min(quantity, available));

    if (quantity > available) {
      setError(
        `Only ${formatQuantity(
          available,
          item.product.unit.abbreviation,
        )} of ${formatProductName(item.product)} is available.`,
      );
      return;
    }

    setError(null);
    const optimistic = updateSessionProductQuantity(current, item, nextQuantity);

    applySession(optimistic, false);

    if (terminalRef.current?.offlineEnabled) {
      await saveActiveOfflineSession(terminalRef.current.id, optimistic);
      return;
    }

    queueCartSync(optimistic, item, nextQuantity);
  }

  const syncPendingOfflineSales = useCallback(async () => {
    const currentTerminal = terminalRef.current;

    if (!currentTerminal?.offlineEnabled || syncBusy) {
      return;
    }

    if (!navigator.onLine) {
      setIsOnline(false);
      setSyncMessage("Offline sales will sync when the network returns.");
      return;
    }

    const pendingSales = await unresolvedOfflineSales(currentTerminal.id);

    if (pendingSales.length === 0) {
      const snapshot = await prepareOfflineSnapshot(currentTerminal, true).catch(
        () => null,
      );
      const remaining = await unresolvedOfflineSales(currentTerminal.id);
      await refreshQueuedSales(currentTerminal.id);
      await confirmDayCloseReadiness(snapshot, remaining.length);
      setSyncMessage(
        snapshot?.dayCloseBarrier?.status === "CLOSING" &&
          remaining.length === 0
          ? "POS is synced and ready for day close."
          : "POS is synced.",
      );
      return;
    }

    setSyncBusy(true);
    setSyncMessage(`Syncing ${pendingSales.length} offline sale(s)...`);

    for (const sale of pendingSales) {
      await updateQueuedOfflineSale(sale.clientRequestId, {
        status: "SYNCING",
        errorMessage: null,
      });
    }
    await refreshQueuedSales(currentTerminal.id);

    try {
      const response = await apiJson<PosOfflineSyncResponse>("/sync", {
        method: "POST",
        body: JSON.stringify({
          terminalId: currentTerminal.id,
          sales: pendingSales.map((sale) => sale.payload),
        }),
      });
      let conflictCount = 0;

      for (const result of response.results) {
        if (result.status === "CONFLICT" || result.status === "FAILED") {
          conflictCount += 1;
        }

        await updateQueuedOfflineSale(result.clientRequestId, {
          status: result.status,
          errorMessage: result.errorMessage,
          syncedSale: result.sale,
        });
      }

      const snapshot = await prepareOfflineSnapshot(
        currentTerminal,
        true,
      ).catch(() => null);
      const remaining = await unresolvedOfflineSales(currentTerminal.id);
      await refreshQueuedSales(currentTerminal.id);
      await confirmDayCloseReadiness(snapshot, remaining.length);
      setSyncMessage(
        conflictCount > 0
          ? `${conflictCount} offline sale(s) need review before they can sync.`
          : "Offline sales synced.",
      );
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Unable to sync offline sales.";

      for (const sale of pendingSales) {
        await updateQueuedOfflineSale(sale.clientRequestId, {
          status: "FAILED",
          errorMessage: message,
        });
      }
      await refreshQueuedSales(currentTerminal.id);
      setSyncMessage(message);
    } finally {
      setSyncBusy(false);
    }
  }, [
    confirmDayCloseReadiness,
    prepareOfflineSnapshot,
    refreshQueuedSales,
    syncBusy,
  ]);

  useEffect(() => {
    function markOnline() {
      setIsOnline(true);
      const currentTerminal = terminalRef.current;

      if (currentTerminal?.offlineEnabled) {
        void syncPendingOfflineSales();
      }
    }

    function markOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);

    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    };
  }, [syncPendingOfflineSales]);

  useEffect(() => {
    if (!terminal?.offlineEnabled || !isOnline) {
      return;
    }

    let cancelled = false;
    const publish = async () => {
      if (cancelled) {
        return;
      }

      await apiJson(`/terminals/${terminal.id}/display-preview`, {
        method: "POST",
        body: JSON.stringify(buildPosDisplayPreview(session)),
      }).catch(() => undefined);
    };
    const timeout = window.setTimeout(() => void publish(), CART_SYNC_DELAY_MS);
    const interval = session
      ? window.setInterval(() => void publish(), 5000)
      : null;

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [isOnline, session, terminal?.id, terminal?.offlineEnabled]);

  async function checkout() {
    await sessionPatchQueueRef.current;
    const currentSession = sessionRef.current;

    if (
      !currentSession ||
      currentSession.status !== "ACTIVE" ||
      cartIsSyncing ||
      syncBusy ||
      sessionPatchCountRef.current > 0
    ) {
      return;
    }

    // Reserve an invisible print target while handling the cashier's click.
    // The print dialog is opened only after checkout has completed.
    let receiptFrame: HTMLIFrameElement | null = reserveReceiptPrintFrame();

    setBusy(true);
    setError(null);

    try {
      const currentTerminal = terminalRef.current;

      if (currentTerminal?.offlineEnabled) {
        if (offlineSnapshot?.dayCloseBarrier?.checkoutBlocked) {
          throw new Error(
            "Checkout is paused while this business day is being closed. Sync this terminal and wait for Sales or Management to complete the close.",
          );
        }
        if (currentSession.items.length === 0) {
          throw new Error("Add at least one product before checkout.");
        }

        const currentRetailer =
          currentSession.customerType === "RETAILER"
            ? availableRetailers.find(
                (retailer) => retailer.id === currentSession.retailer?.id,
              ) ?? null
            : null;
        const currentRetailerSelectionMissing =
          currentSession.customerType === "RETAILER" && !currentRetailer;
        const currentRetailerApprovalMissing =
          currentSession.customerType === "RETAILER" &&
          currentSession.paymentMethod === "CREDIT" &&
          Boolean(currentRetailer?.requiresOrderApproval) &&
          !currentSession.retailerApprovalId;

        if (currentRetailerSelectionMissing) {
          throw new Error("Select a retailer before checkout.");
        }

        if (currentRetailerApprovalMissing) {
          throw new Error(
            "Admin approval is required before this retailer credit sale can be queued.",
          );
        }

        const soldAt = new Date().toISOString();
        const payload = buildOfflineSalePayload({
          session: currentSession,
          terminalId: currentTerminal.id,
          clientRequestId: `offline:${currentTerminal.id}:${createUuid()}`,
          soldAt,
        });

        await addQueuedOfflineSale(payload);
        await clearActiveOfflineSession(currentTerminal.id);
        await refreshQueuedSales(currentTerminal.id);
        clearCartSyncs();

        // When online, sync before printing so the receipt can carry the
        // real sale number once the server records it.
        let syncedSaleNumber: number | null = null;

        if (navigator.onLine) {
          setSyncMessage("Recording sale...");
          await syncPendingOfflineSales();

          const queued = await listQueuedOfflineSales(currentTerminal.id);
          syncedSaleNumber =
            queued.find(
              (record) => record.clientRequestId === payload.clientRequestId,
            )?.syncedSale?.saleNumber ?? null;
        } else {
          setSyncMessage(
            "Sale queued offline. It will sync when the network returns.",
          );
        }

        const completedSession: PosSession = {
          ...currentSession,
          status: "COMPLETED",
          updatedAt: soldAt,
          completedAt: soldAt,
          completedSale: syncedSaleNumber
            ? {
                id: `synced-sale-${syncedSaleNumber}`,
                saleNumber: syncedSaleNumber,
                totalAmount: currentSession.totalAmount,
                amountPaid: currentSession.amountPaid,
                balanceDue: currentSession.balanceDue,
                soldAt,
              }
            : null,
        };
        const receipt = buildReceiptDocument({
          session: completedSession,
          terminalName: currentTerminal.name,
          saleNumber: syncedSaleNumber,
        });

        applySession(completedSession);
        setLastReceipt(receipt);
        printReceipt(receipt, receiptFrame);
        receiptFrame = null;

        return;
      }

      await apiJson<PosSession>(`/sessions/${currentSession.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          customerType,
          retailerId: customerType === "RETAILER" ? retailerId || null : null,
          retailerApprovalId:
            customerType === "RETAILER" && paymentMethod === "CREDIT"
              ? retailerApprovalId || null
              : null,
          paymentMethod,
        }),
      });
      const completed = await apiJson<PosSession>(
        `/sessions/${currentSession.id}/checkout`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const receipt = buildReceiptDocument({
        session: completed,
        terminalName: currentTerminal?.name,
      });

      window.localStorage.removeItem("muisbakery.posSessionId");
      clearCartSyncs();
      applySession(completed);
      setLastReceipt(receipt);
      printReceipt(receipt, receiptFrame);
      receiptFrame = null;
    } catch (caught) {
      receiptFrame?.remove();
      setError(caught instanceof Error ? caught.message : "Unable to checkout.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSession() {
    if (!session) {
      return;
    }

    setBusy(true);
    setError(null);
    clearCartSyncs();

    try {
      if (terminalRef.current?.offlineEnabled) {
        await clearActiveOfflineSession(terminalRef.current.id);
        applySession(null);
        return;
      }

      await apiJson<PosSession>(`/sessions/${session.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      window.localStorage.removeItem("muisbakery.posSessionId");
      applySession(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to cancel sale.");
    } finally {
      setBusy(false);
    }
  }

  async function copyDisplayUrl() {
    if (!displayUrl) {
      return;
    }

    await navigator.clipboard?.writeText(displayUrl).catch(() => undefined);
  }

  function cartQuantity(productId: string) {
    return Number(
      session?.items.find((item) => item.product.id === productId)?.quantity ?? 0,
    );
  }

  return (
    <div className="grid min-w-0 max-w-full gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="min-w-0 rounded-md border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-md flex-1">
            <Search
              aria-hidden
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            />
            <input
              className="h-10 w-full rounded-md border border-stone-300 bg-white pl-9 pr-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search products"
              type="search"
              value={query}
            />
          </div>
        </div>

        {!terminal ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              {isOnline ? "Terminal setup required" : "Online setup required"}
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              {isOnline
                ? "Enter the setup ID from Admin > POS terminals before using this sales point."
                : "This browser has no paired POS terminal and cached offline snapshot. Connect once, pair the terminal, then refresh the offline stock snapshot before selling offline."}
            </p>
            {isOnline ? (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
                  onChange={(event) => setTerminalSetupId(event.target.value)}
                  placeholder="POS terminal setup ID"
                  type="text"
                  value={terminalSetupId}
                />
                <input
                  className="h-10 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
                  onChange={(event) =>
                    setTerminalPairingCode(event.target.value)
                  }
                  placeholder="Pairing code"
                  type="password"
                  value={terminalPairingCode}
                />
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-stone-400"
                  disabled={busy}
                  onClick={claimTerminal}
                  type="button"
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      Pairing...
                    </span>
                  ) : (
                    "Pair terminal"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="rounded-md border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
            No products available.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((item) => {
              const quantity = cartQuantity(item.product.id);

              return (
                <button
                  className="min-h-28 rounded-md border border-stone-200 bg-stone-50 p-3 text-left transition hover:border-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!terminal || (busy && !session)}
                  key={item.product.id}
                  onClick={() => setProductQuantity(item, quantity + 1)}
                  type="button"
                >
                  <span className="block font-semibold text-stone-950">
                    {formatProductName(item.product)}
                  </span>
                  <span className="mt-1 block text-sm text-stone-500">
                    {formatQuantity(
                      productAvailability(item),
                      item.product.unit.abbreviation,
                    )}
                  </span>
                  <span className="mt-3 block text-sm font-semibold text-red-800">
                    {formatMoney(item.product.unitPrice ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <aside className="min-w-0 rounded-md border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-stone-950">Current sale</h2>
            <p className="text-sm text-stone-500">
              {session
                ? session.status === "ACTIVE"
                  ? cartIsSyncing
                    ? "Saving cart"
                    : "Active"
                  : session.status.toLowerCase()
                : "No active sale"}
            </p>
          </div>
          {session ? (
            <button
              className={iconButtonClass}
              disabled={busy}
              onClick={cancelSession}
              title="Cancel sale"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {displayUrl ? (
          <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-stone-900">
                Customer display
              </p>
              <div className="flex gap-2">
                <a
                  className={iconButtonClass}
                  href={displayUrl}
                  target="_blank"
                  title="Open customer display"
                >
                  <MonitorUp className="h-4 w-4" />
                </a>
                <button
                  className={iconButtonClass}
                  onClick={copyDisplayUrl}
                  title="Copy customer display link"
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 break-all text-xs text-stone-500">{displayUrl}</p>
          </div>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {offlineEnabled ? (
          <div className="mb-4 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-stone-950">
                  {isOnline ? "Online" : "Offline"} POS
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {unresolvedQueuedSales.length} pending, {failedOfflineCount}{" "}
                  need review, {syncedOfflineCount} synced.
                </p>
                <p
                  className={`mt-1 text-xs font-medium ${
                    posShellStatus?.ready
                      ? "text-emerald-700"
                      : posShellStatus?.message
                        ? "text-red-700"
                        : "text-amber-700"
                  }`}
                  title={posShellStatus?.message}
                >
                  {posShellStatus?.ready
                    ? "Offline reload ready"
                    : posShellStatus?.message
                      ? "Offline reload not ready"
                      : "Preparing offline reload..."}
                </p>
              </div>
              <button
                className="inline-flex h-8 items-center justify-center rounded-[5px] border border-[color:var(--border-muted)] bg-white px-3 text-xs font-semibold text-stone-700 shadow-[var(--shadow-whisper)] transition hover:border-red-800 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={syncBusy || !isOnline}
                onClick={() => void syncPendingOfflineSales()}
                type="button"
              >
                {syncBusy ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Spinner className="size-3" />
                    Syncing...
                  </span>
                ) : (
                  "Sync now"
                )}
              </button>
            </div>
            {syncMessage ? (
              <p
                className={`mt-2 rounded-[5px] px-2 py-1 text-xs ${
                  failedOfflineCount > 0
                    ? "bg-red-50 text-red-800"
                    : "bg-emerald-50 text-emerald-800"
                }`}
              >
                {syncMessage}
              </p>
            ) : null}
            {offlineSnapshot?.dayCloseBarrier?.checkoutBlocked ? (
              <p className="mt-2 rounded-[5px] border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-900">
                Checkout paused for day close. Sync this terminal until its
                queue is confirmed empty.
              </p>
            ) : null}
            {failedOfflineCount > 0 ? (
              <div className="mt-2 grid gap-1 text-xs text-red-800">
                {unresolvedQueuedSales
                  .filter(
                    (sale) =>
                      sale.status === "FAILED" || sale.status === "CONFLICT",
                  )
                  .slice(0, 3)
                  .map((sale) => (
                    <p key={sale.clientRequestId}>
                      {sale.errorMessage ?? "Offline sale needs review."}
                    </p>
                  ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!session ? (
          <div className="grid gap-3">
            {lastReceipt ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <p className="font-semibold">Last receipt is ready.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-[5px] bg-emerald-700 px-3 text-xs font-semibold text-white transition hover:bg-emerald-800"
                    onClick={() => printReceipt(lastReceipt)}
                    type="button"
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </button>
                  <button
                    className="inline-flex h-8 items-center justify-center gap-2 rounded-[5px] border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800 transition hover:border-emerald-700"
                    onClick={() => downloadReceipt(lastReceipt)}
                    type="button"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              </div>
            ) : null}
            <button
              className="flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 text-sm font-medium text-stone-600 transition hover:border-red-800 hover:text-red-800"
              disabled={busy || !terminal}
              onClick={startSession}
              type="button"
            >
              {busy ? <Spinner /> : <Plus className="h-4 w-4" />}
              {busy ? "Starting..." : "Start sale"}
            </button>
          </div>
        ) : session.status === "COMPLETED" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">
              {session.completedSale?.saleNumber
                ? `Sale #${session.completedSale.saleNumber} completed.`
                : "Checkout successful. Sale queued for synchronization."}
            </p>
            <p className="mt-1">
              Total {formatMoney(session.totalAmount)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {lastReceipt ? (
                <>
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-700"
                    onClick={() => printReceipt(lastReceipt)}
                    type="button"
                  >
                    <Printer className="h-4 w-4" />
                    Print receipt
                  </button>
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-emerald-300 bg-white px-3 text-sm font-semibold text-emerald-800 transition hover:border-emerald-700"
                    onClick={() => downloadReceipt(lastReceipt)}
                    type="button"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </>
              ) : null}
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white"
                onClick={startSession}
                type="button"
              >
                <RotateCcw className="h-4 w-4" />
                New sale
              </button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-3">
              {session.items.length === 0 ? (
                <p className="rounded-md border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">
                  Cart is empty.
                </p>
              ) : (
                session.items.map((item) => {
                  const inventoryItem = productSource.find(
                    (entry) => entry.product.id === item.product.id,
                  );

                  return (
                    <div
                      className="rounded-md border border-stone-200 p-3"
                      key={item.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium text-stone-950">
                            {formatProductName(item.product)}
                          </p>
                          <p className="text-sm text-stone-500">
                            {formatMoney(item.unitPrice)} each
                          </p>
                        </div>
                        <p className="font-semibold text-stone-950">
                          {formatMoney(item.lineTotal)}
                        </p>
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            className={iconButtonClass}
                            disabled={!inventoryItem}
                            onClick={() =>
                              inventoryItem
                                ? setProductQuantity(
                                  inventoryItem,
                                  Number(item.quantity) - 1,
                                )
                                : undefined
                            }
                            title="Reduce quantity"
                            type="button"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <div className="flex items-center gap-1">
                            <input
                              aria-label={`Quantity for ${formatProductName(
                                item.product,
                              )}`}
                              className="h-9 w-20 rounded-[5px] border border-[color:var(--border-muted)] bg-white px-2 text-center text-sm font-semibold text-stone-900 shadow-[var(--shadow-whisper)] outline-none transition focus:border-[var(--brand-burgundy)] focus:ring-4 focus:ring-[var(--focus-ring)]"
                              disabled={!inventoryItem}
                              inputMode="numeric"
                              max={
                                inventoryItem
                                  ? productAvailability(inventoryItem)
                                  : undefined
                              }
                              min="0"
                              onChange={(event) =>
                                inventoryItem
                                  ? setProductQuantity(
                                      inventoryItem,
                                      Number.parseInt(
                                        event.target.value || "0",
                                        10,
                                      ),
                                    )
                                  : undefined
                              }
                              step="1"
                              type="number"
                              value={item.quantity}
                            />
                            <span className="text-xs text-stone-500">
                              {item.product.unit.abbreviation}
                            </span>
                          </div>
                          <button
                            className={iconButtonClass}
                            disabled={!inventoryItem}
                            onClick={() =>
                              inventoryItem
                                ? setProductQuantity(
                                  inventoryItem,
                                  Number(item.quantity) + 1,
                                )
                                : undefined
                            }
                            title="Increase quantity"
                            type="button"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          className={iconButtonClass}
                          disabled={!inventoryItem}
                          onClick={() =>
                            inventoryItem
                              ? setProductQuantity(inventoryItem, 0)
                              : undefined
                          }
                          title="Remove item"
                          type="button"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="grid gap-3 border-t border-stone-200 pt-4">
              <div className="grid gap-1.5">
                <label
                  className="text-sm font-medium text-stone-700"
                  htmlFor="customerType"
                >
                  Customer type
                </label>
                <select
                  className={fieldClass}
                  id="customerType"
                  onChange={(event) =>
                    void changeCustomerType(event.target.value as CustomerType)
                  }
                  value={customerType}
                >
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="RETAILER">Retailer</option>
                </select>
              </div>

              {customerType === "RETAILER" ? (
                <div className="grid gap-2">
                  <div className="grid gap-1.5">
                    <label
                      className="text-sm font-medium text-stone-700"
                      htmlFor="retailerId"
                    >
                      Retailer account
                    </label>
                    <select
                      className={fieldClass}
                      id="retailerId"
                      onChange={(event) => void changeRetailer(event.target.value)}
                      value={retailerId}
                    >
                      <option value="">Select retailer</option>
                      {availableRetailers.map((retailer) => (
                        <option key={retailer.id} value={retailer.id}>
                          {retailer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedRetailer ? (
                    <div className="rounded-[5px] border border-[color:var(--border-muted)] bg-[var(--surface-warm)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                      <p>
                        Outstanding balance:{" "}
                        <span className="font-semibold text-[var(--text-primary)]">
                          {formatMoney(selectedRetailer.outstandingBalance)}
                        </span>
                      </p>
                      {selectedRetailer.requiresOrderApproval ? (
                        paymentMethod === "CREDIT" ? (
                          <p className="mt-1 font-semibold text-red-800">
                            Admin approval required for another credit sale.
                          </p>
                        ) : (
                          <p className="mt-1 font-semibold text-emerald-700">
                            Paid-now sale. Existing credit remains for follow-up.
                          </p>
                        )
                      ) : (
                        <p className="mt-1 font-semibold text-emerald-700">
                          No uncleared credit.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                      Create or select a retailer account before checkout.
                    </p>
                  )}
                  {selectedRetailer?.requiresOrderApproval &&
                  paymentMethod === "CREDIT" ? (
                    selectedRetailer.orderApprovals.length > 0 ? (
                      <div className="grid gap-1.5">
                        <label
                          className="text-sm font-medium text-stone-700"
                          htmlFor="retailerApprovalId"
                        >
                          Admin approval
                        </label>
                        <select
                          className={fieldClass}
                          id="retailerApprovalId"
                          onChange={(event) =>
                            void changeRetailerApproval(event.target.value)
                          }
                          value={retailerApprovalId}
                        >
                          <option value="">Select approval</option>
                          {selectedRetailer.orderApprovals.map((approval) => (
                            <option key={approval.id} value={approval.id}>
                              {formatMoney(approval.approvedAmount)}
                              {approval.expiresAt
                                ? ` expires ${new Intl.DateTimeFormat("en", {
                                    dateStyle: "medium",
                                  }).format(new Date(approval.expiresAt))}`
                                : ""}
                            </option>
                          ))}
                        </select>
                        {selectedApproval ? (
                          <p className="text-xs text-stone-500">
                            Covers up to{" "}
                            {formatMoney(selectedApproval.approvedAmount)}.
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="grid gap-2 rounded-[5px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        <p>
                          Ask Admin to approve this retailer before credit
                          checkout.
                        </p>
                        {pendingApprovalRequest ? (
                          <p className="font-semibold text-amber-800">
                            Pending request:{" "}
                            {formatMoney(pendingApprovalRequest.approvedAmount)}
                          </p>
                        ) : (
                          <button
                            className="inline-flex h-8 w-fit items-center justify-center rounded-[5px] bg-red-800 px-3 text-xs font-semibold text-white transition hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-stone-400"
                            disabled={
                              approvalRequestBusy ||
                              !isOnline ||
                              Number(session.totalAmount) <= 0
                            }
                            onClick={requestAdminApproval}
                            type="button"
                          >
                            {approvalRequestBusy
                              ? "Requesting..."
                              : "Request Admin approval"}
                          </button>
                        )}
                        {approvalRequestSent ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-emerald-700">
                              Request sent. Refresh after Admin approves it.
                            </p>
                            <button
                              className="inline-flex h-7 items-center justify-center rounded-[5px] border border-emerald-300 bg-white px-2 text-xs font-semibold text-emerald-800"
                              onClick={() => void refreshRetailers()}
                              type="button"
                            >
                              Refresh approvals
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
              ) : null}

              <select
                className={fieldClass}
                onChange={(event) => {
                  const method = event.target.value as PaymentMethod;
                  setPaymentMethod(method);
                  setApprovalRequestSent(false);
                  if (method !== "CREDIT") {
                    setRetailerApprovalId("");
                  }
                  void patchSession({
                    paymentMethod: method,
                    retailerApprovalId: method === "CREDIT"
                      ? retailerApprovalId || null
                      : null,
                  });
                }}
                value={paymentMethod}
              >
                {options.paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {paymentLabels[method]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 border-t border-stone-200 pt-4 text-sm">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span>{formatMoney(session.subtotal)}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold text-stone-950">
                <span>Total</span>
                <span>{formatMoney(session.totalAmount)}</span>
              </div>
            </div>

            <button
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-stone-400"
              disabled={
                busy ||
                syncBusy ||
                cartIsSyncing ||
                sessionPatchBusy ||
                session.items.length === 0 ||
                retailerSelectionMissing ||
                retailerApprovalMissing ||
                Boolean(offlineSnapshot?.dayCloseBarrier?.checkoutBlocked)
              }
              onClick={checkout}
              type="button"
            >
              {busy || cartIsSyncing || sessionPatchBusy ? (
                <Spinner />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {busy
                ? "Processing..."
                : cartIsSyncing
                  ? "Saving cart..."
                  : sessionPatchBusy
                    ? "Saving sale..."
                    : offlineEnabled && !isOnline
                      ? "Queue sale"
                      : "Checkout"}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
