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
import { formatProductName } from "@/lib/product-label";
import {
  apiJson,
  calculateSessionTotals,
  CART_SYNC_DELAY_MS,
  buildOfflineSalePayload,
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

type ReceiptDocument = {
  filename: string;
  html: string;
  text: string;
};

type PosShellStatus = {
  ready: boolean;
  message?: string;
};

const POS_SHELL_STATUS_EVENT = "muisbakery:pos-shell-status";

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

function retailersFromOfflineSnapshot(snapshot: PosOfflineSnapshot): Retailer[] {
  return snapshot.retailerCreditAllocations
    .filter((allocation) => allocation.isActive)
    .map((allocation) => ({
      id: allocation.retailer.id,
      name: allocation.retailer.name,
      contactPerson: allocation.retailer.contactPerson,
      phone: null,
      email: null,
      address: null,
      creditLimit: allocation.allocatedAmount,
      outstandingBalance: "0.00",
      availableCredit: allocation.remainingAmount,
      requiresOrderApproval: false,
      orderApprovals: [],
      orderApprovalRequests: [],
      notes: null,
      isActive: allocation.isActive,
      createdAt: allocation.createdAt,
      updatedAt: allocation.updatedAt,
      createdBy: null,
    }));
}

function buildReceiptDocument({
  session,
  terminalName,
  pending,
}: {
  session: PosSession;
  terminalName: string | null | undefined;
  pending?: boolean;
}): ReceiptDocument {
  const saleNumber = session.completedSale?.saleNumber
    ? `#${session.completedSale.saleNumber}`
    : pending
      ? "Pending offline sync"
      : session.id;
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
    `Sale: ${saleNumber}`,
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
    pending ? "Status: Queued offline - valid after sync" : "Status: Paid/recorded",
  ];
  const text = lines.join("\n");
  const htmlRows = session.items
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(formatProductName(item.product))}</td>
          <td>${escapeHtml(formatQuantity(item.quantity, item.product.unit.abbreviation))}</td>
          <td>${escapeHtml(formatMoney(item.unitPrice))}</td>
          <td>${escapeHtml(formatMoney(item.lineTotal))}</td>
        </tr>`,
    )
    .join("");
  const html = `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Muis Bakery Receipt ${escapeHtml(saleNumber)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
          .receipt { max-width: 360px; }
          h1 { font-size: 20px; margin: 0 0 4px; }
          h2 { font-size: 14px; margin: 0 0 16px; color: #9f2137; text-transform: uppercase; letter-spacing: 1px; }
          p { margin: 4px 0; font-size: 12px; }
          table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 12px; }
          th, td { border-bottom: 1px solid #ddd; padding: 6px 0; text-align: left; vertical-align: top; }
          th:last-child, td:last-child { text-align: right; }
          .totals { border-top: 2px solid #111; padding-top: 8px; }
          .totals p { display: flex; justify-content: space-between; }
          .total { font-size: 16px; font-weight: 700; }
          .status { margin-top: 16px; font-size: 11px; color: #555; }
          @media print { body { margin: 0; } .receipt { max-width: none; } }
        </style>
      </head>
      <body>
        <div class="receipt">
          <h1>Muis Bakery</h1>
          <h2>Sales receipt</h2>
          <p><strong>Sale:</strong> ${escapeHtml(saleNumber)}</p>
          <p><strong>Terminal:</strong> ${escapeHtml(terminalName ?? "POS terminal")}</p>
          <p><strong>Customer:</strong> ${escapeHtml(receiptCustomer(session))}</p>
          <p><strong>Payment:</strong> ${escapeHtml(paymentLabels[session.paymentMethod])}</p>
          <p><strong>Date:</strong> ${escapeHtml(receiptDate(soldAt))}</p>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
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
          <p class="status">${pending ? "Queued offline - valid after sync." : "Paid/recorded."}</p>
        </div>
      </body>
    </html>`;

  return {
    filename: `muis-bakery-receipt-${String(saleNumber).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
    html,
    text,
  };
}

function printReceipt(receipt: ReceiptDocument) {
  const receiptWindow = window.open("", "_blank", "width=420,height=680");

  if (!receiptWindow) {
    return false;
  }

  receiptWindow.document.open();
  receiptWindow.document.write(receipt.html);
  receiptWindow.document.close();
  receiptWindow.focus();
  window.setTimeout(() => receiptWindow.print(), 250);
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
            setRetailers((current) =>
              current.length > 0
                ? current
                : retailersFromOfflineSnapshot(cached),
            );
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
      setRetailers((current) =>
        current.length > 0 ? current : retailersFromOfflineSnapshot(snapshot),
      );
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
    setRetailers((current) =>
      current.length > 0 ? current : retailersFromOfflineSnapshot(cached),
    );
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

    void caches
      .open("muisbakery-pos-v3")
      .then((cache) => cache.match("/sales/pos", { ignoreVary: true }))
      .then((cached) => {
        if (cached && navigator.serviceWorker.controller) {
          setPosShellStatus({ ready: true });
        }
      })
      .catch(() => undefined);

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

  const active = session?.status === "ACTIVE";
  const selectedRetailer: Retailer | null =
    retailers.find((retailer) => retailer.id === retailerId) ??
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
            id: `offline-session-${crypto.randomUUID()}`,
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
    if (!session || !active) {
      return;
    }

    const currentTerminal = terminalRef.current;

    if (currentTerminal?.offlineEnabled) {
      const nextCustomerType = patch.customerType ?? session.customerType;
      const nextRetailer =
        nextCustomerType === "RETAILER"
          ? retailers.find(
              (retailer) =>
                retailer.id ===
                (patch.retailerId === undefined
                  ? session.retailer?.id
                  : patch.retailerId),
            ) ?? session.retailer
          : null;
      const nextSession = calculateSessionTotals({
        ...session,
        customerType: nextCustomerType,
        retailer: nextRetailer,
        retailerApprovalId:
          nextCustomerType === "RETAILER"
            ? patch.retailerApprovalId === undefined
              ? session.retailerApprovalId
              : patch.retailerApprovalId
            : null,
        customerName:
          nextCustomerType === "RETAILER"
            ? nextRetailer?.name ?? null
            : patch.customerName === undefined
              ? session.customerName
              : patch.customerName,
        paymentMethod: patch.paymentMethod ?? session.paymentMethod,
        discount: patch.discount ?? session.discount,
        amountPaid: patch.amountPaid ?? session.amountPaid,
        notes: patch.notes === undefined ? session.notes : patch.notes,
        updatedAt: new Date().toISOString(),
      });

      await saveActiveOfflineSession(currentTerminal.id, nextSession);
      applySession(nextSession);
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const updated = await apiJson<PosSession>(`/sessions/${session.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });

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

    const nextRetailer = selectedRetailer ?? retailers[0] ?? null;
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
      retailers.find((retailer) => retailer.id === nextRetailerId) ??
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
      await prepareOfflineSnapshot(currentTerminal, true).catch(() => null);
      await refreshQueuedSales(currentTerminal.id);
      setSyncMessage("POS is synced.");
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

      await prepareOfflineSnapshot(currentTerminal, true).catch(() => null);
      await refreshQueuedSales(currentTerminal.id);
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
  }, [prepareOfflineSnapshot, refreshQueuedSales, syncBusy]);

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

  async function checkout() {
    if (!session || !active || cartIsSyncing) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const currentTerminal = terminalRef.current;

      if (currentTerminal?.offlineEnabled) {
        if (session.items.length === 0) {
          throw new Error("Add at least one product before checkout.");
        }

        if (retailerSelectionMissing) {
          throw new Error("Select a retailer before checkout.");
        }

        if (retailerApprovalMissing) {
          throw new Error(
            "Admin approval is required before this retailer credit sale can be queued.",
          );
        }

        const soldAt = new Date().toISOString();
        const payload = buildOfflineSalePayload({
          session,
          terminalId: currentTerminal.id,
          clientRequestId: `offline:${currentTerminal.id}:${crypto.randomUUID()}`,
          soldAt,
        });
        const receipt = buildReceiptDocument({
          session: {
            ...session,
            completedAt: soldAt,
          },
          terminalName: currentTerminal.name,
          pending: true,
        });

        await addQueuedOfflineSale(payload);
        await clearActiveOfflineSession(currentTerminal.id);
        await refreshQueuedSales(currentTerminal.id);
        clearCartSyncs();
        applySession(null);
        setLastReceipt(receipt);
        printReceipt(receipt);
        setSyncMessage(
          navigator.onLine
            ? "Sale queued. Syncing now..."
            : "Sale queued offline. It will sync when the network returns.",
        );

        if (navigator.onLine) {
          await syncPendingOfflineSales();
        }

        return;
      }

      await apiJson<PosSession>(`/sessions/${session.id}`, {
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
        `/sessions/${session.id}/checkout`,
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
      printReceipt(receipt);
    } catch (caught) {
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
                  Pair terminal
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
                {syncBusy ? "Syncing..." : "Sync now"}
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
              <Plus className="h-4 w-4" />
              Start sale
            </button>
          </div>
        ) : session.status === "COMPLETED" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">
              Sale #{session.completedSale?.saleNumber} completed.
            </p>
            <p className="mt-1">
              Total {formatMoney(session.completedSale?.totalAmount ?? 0)}
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
                      {retailers.map((retailer) => (
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
                cartIsSyncing ||
                session.items.length === 0 ||
                retailerSelectionMissing ||
                retailerApprovalMissing
              }
              onClick={checkout}
              type="button"
            >
              <Check className="h-4 w-4" />
              {cartIsSyncing
                ? "Saving cart..."
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
