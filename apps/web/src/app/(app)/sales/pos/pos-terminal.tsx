"use client";

import {
  Check,
  Copy,
  Minus,
  MonitorUp,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CustomerType,
  PaymentMethod,
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
  fieldClass,
  formatMoney,
  formatQuantity,
  iconButtonClass,
  paymentLabels,
  productAvailable,
  roundCount,
  updateSessionProductQuantity,
  type PosSessionPatch,
} from "./_lib/pos-terminal-helpers";

export function PosTerminal({ options }: { options: SalesOptions }) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [terminal, setTerminal] = useState<PosTerminalRecord | null>(null);
  const [query, setQuery] = useState("");
  const [retailers, setRetailers] = useState(options.retailers);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

      if (existingId) {
        try {
          const loaded = await apiJson<PosTerminalRecord>(
            `/terminals/${existingId}`,
          );
          applyTerminal(loaded);
          return loaded;
        } catch {
          window.localStorage.removeItem("muisbakery.posTerminalId");
          setTerminalSetupId("");
        }
      }

      throw new Error(
        "This device is not paired to a POS terminal. Ask Admin to create a terminal, then enter its setup ID here.",
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

  async function claimTerminal() {
    const setupId = terminalSetupId.trim();

    if (!setupId) {
      setError("Enter the POS terminal setup ID from Admin.");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const loaded = await apiJson<PosTerminalRecord>(`/terminals/${setupId}`);

      window.localStorage.setItem("muisbakery.posTerminalId", loaded.id);
      setTerminalSetupId(loaded.id);
      applyTerminal(loaded);
    } catch (caught) {
      window.localStorage.removeItem("muisbakery.posTerminalId");
      applyTerminal(null);
      setError(
        caught instanceof Error ? caught.message : "Unable to pair terminal.",
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const cartSyncs = cartSyncsRef.current;
    void ensureTerminal().catch((caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to prepare POS terminal.",
      );
    });
    const existingId = window.localStorage.getItem("muisbakery.posSessionId");

    if (!existingId) {
      return;
    }

    void apiJson<PosSession>(`/sessions/${existingId}`)
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

    return () => {
      for (const entry of cartSyncs.values()) {
        clearTimeout(entry.timeout);
      }
      cartSyncs.clear();
    };
  }, [applySession, ensureTerminal]);

  const filteredProducts = useMemo(() => {
    const search = query.trim().toLowerCase();

    return options.products.filter((item) => {
      if (productAvailable(item) <= 0) {
        return false;
      }
      if (!search) {
        return true;
      }
      return formatProductName(item.product).toLowerCase().includes(search);
    });
  }, [options.products, query]);

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

    const available = productAvailable(item);
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
    queueCartSync(optimistic, item, nextQuantity);
  }

  async function checkout() {
    if (!session || !active || cartIsSyncing) {
      return;
    }

    setBusy(true);
    setError(null);

    try {
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

      window.localStorage.removeItem("muisbakery.posSessionId");
      clearCartSyncs();
      applySession(completed);
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
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-red-800 px-4 text-sm font-semibold text-white transition hover:bg-red-900 disabled:cursor-not-allowed disabled:bg-stone-400"
            disabled={busy || !terminal}
            onClick={startSession}
            type="button"
          >
            <Plus className="h-4 w-4" />
            New sale
          </button>
        </div>

        {!terminal ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-950">
              Terminal setup required
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              Enter the setup ID from Admin &gt; POS terminals before using this
              sales point.
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
                onChange={(event) => setTerminalSetupId(event.target.value)}
                placeholder="POS terminal setup ID"
                type="text"
                value={terminalSetupId}
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
                      productAvailable(item),
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

        {!session ? (
          <button
            className="flex h-28 w-full items-center justify-center gap-2 rounded-md border border-dashed border-stone-300 text-sm font-medium text-stone-600 transition hover:border-red-800 hover:text-red-800"
            disabled={busy || !terminal}
            onClick={startSession}
            type="button"
          >
            <Plus className="h-4 w-4" />
            Start sale
          </button>
        ) : session.status === "COMPLETED" ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-semibold">
              Sale #{session.completedSale?.saleNumber} completed.
            </p>
            <p className="mt-1">
              Total {formatMoney(session.completedSale?.totalAmount ?? 0)}
            </p>
            <button
              className="mt-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-semibold text-white"
              onClick={startSession}
              type="button"
            >
              <RotateCcw className="h-4 w-4" />
              New sale
            </button>
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
                  const inventoryItem = options.products.find(
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
                                  ? productAvailable(inventoryItem)
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
              {cartIsSyncing ? "Saving cart..." : "Checkout"}
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
