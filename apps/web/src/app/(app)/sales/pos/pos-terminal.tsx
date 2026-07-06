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
import { io, type Socket } from "socket.io-client";

import type {
  PaymentMethod,
  PosSession,
  PosSessionItem,
  PosTerminal as PosTerminalRecord,
  SalesInventoryItem,
  SalesOptions,
} from "@/lib/operations/types";
import { formatProductName } from "@/lib/product-label";
import { getPosDisplaySocketUrl } from "@/lib/pos-display-socket";

const CART_SYNC_DELAY_MS = 250;

const paymentLabels: Record<PaymentMethod, string> = {
  CASH: "Cash",
  TRANSFER: "Transfer",
  POS: "POS",
  CREDIT: "Credit",
};

const fieldClass =
  "h-10 rounded-md border border-stone-300 bg-white px-3 text-sm text-stone-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100";

const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-stone-300 bg-white text-stone-700 transition hover:border-red-800 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50";

function formatMoney(value: string | number) {
  return `₦${Number(value).toLocaleString("en", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatQuantity(value: string | number, unit: string) {
  return `${Number(value).toLocaleString("en", {
    maximumFractionDigits: 3,
  })} ${unit}`;
}

type PosSessionPatch = {
  paymentMethod?: PaymentMethod;
};

async function apiJson<T>(path: string, init?: RequestInit) {
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

function productAvailable(item: SalesInventoryItem) {
  return Math.floor(Number(item.totalRemaining));
}

function roundCount(value: number) {
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

function calculateSessionTotals(session: PosSession) {
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

function updateSessionProductQuantity(
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

export function PosTerminal({ options }: { options: SalesOptions }) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [terminal, setTerminal] = useState<PosTerminalRecord | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cartSyncCount, setCartSyncCount] = useState(0);
  const [origin] = useState(() =>
    typeof window === "undefined" ? "" : window.location.origin,
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const terminalRef = useRef<PosTerminalRecord | null>(null);
  const terminalLoadPromiseRef = useRef<Promise<PosTerminalRecord | null> | null>(
    null,
  );
  const sessionRef = useRef<PosSession | null>(null);
  const sessionStartPromiseRef = useRef<Promise<PosSession | null> | null>(null);
  const displaySocketRef = useRef<Socket | null>(null);
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
    },
    [],
  );

  const applyTerminal = useCallback((nextTerminal: PosTerminalRecord | null) => {
    terminalRef.current = nextTerminal;
    setTerminal(nextTerminal);
  }, []);

  const previewCustomerDisplay = useCallback((nextSession: PosSession | null) => {
    const currentTerminal = terminalRef.current;
    const socket = displaySocketRef.current;

    if (!currentTerminal || !nextSession || !socket) {
      return;
    }

    socket.emit("pos:display:preview", {
      mode: "terminal",
      token: currentTerminal.displayToken,
      session: nextSession,
    });
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
        }
      }

      const created = await apiJson<PosTerminalRecord>("/terminals", {
        method: "POST",
        body: JSON.stringify({ name: "POS terminal" }),
      });

      window.localStorage.setItem("muisbakery.posTerminalId", created.id);
      applyTerminal(created);
      return created;
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

  useEffect(() => {
    const socket = io(getPosDisplaySocketUrl(), {
      transports: ["websocket"],
      withCredentials: true,
    });

    displaySocketRef.current = socket;

    return () => {
      displaySocketRef.current = null;
      socket.disconnect();
    };
  }, []);

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
          previewCustomerDisplay(loaded);
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
    previewCustomerDisplay(optimistic);
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
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
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
            disabled={busy}
            onClick={startSession}
            type="button"
          >
            <Plus className="h-4 w-4" />
            New sale
          </button>
        </div>

        {filteredProducts.length === 0 ? (
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
                  disabled={busy && !session}
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

      <aside className="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
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
            disabled={busy}
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
                          <span className="min-w-16 text-center text-sm font-semibold text-stone-900">
                            {formatQuantity(
                              item.quantity,
                              item.product.unit.abbreviation,
                            )}
                          </span>
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
              <select
                className={fieldClass}
                onChange={(event) => {
                  const method = event.target.value as PaymentMethod;
                  setPaymentMethod(method);
                  void patchSession({ paymentMethod: method });
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
              disabled={busy || cartIsSyncing || session.items.length === 0}
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
