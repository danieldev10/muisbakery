"use client";

import { CheckCircle2, Loader2, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

import type { PosSession, PosTerminal } from "@/lib/operations/types";
import { getPosDisplaySocketUrl } from "@/lib/pos-display-socket";

type DisplayEvent =
  | {
      kind: "session";
      preview?: boolean;
      session: PosSession;
    }
  | {
      kind: "terminal";
      terminal: PosTerminal;
    }
  | {
      kind: "error";
      message?: string;
    };

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

export function CustomerDisplay({
  token,
  mode = "session",
}: {
  token: string;
  mode?: "session" | "terminal";
}) {
  const [session, setSession] = useState<PosSession | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewHoldUntilRef = useRef(0);

  const applyDisplaySession = useCallback(
    (nextSession: PosSession | null, preview = false) => {
      if (preview) {
        previewHoldUntilRef.current = Date.now() + 1000;
      } else if (Date.now() < previewHoldUntilRef.current) {
        setSession((currentSession) => {
          if (
            currentSession?.status === "ACTIVE" &&
            nextSession?.status === "ACTIVE"
          ) {
            return currentSession;
          }

          return nextSession;
        });
        return;
      }

      setSession(nextSession);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const basePath =
      mode === "terminal"
        ? `/api/sales/pos/display/terminal/${token}`
        : `/api/sales/pos/display/${token}`;

    async function loadInitialSession() {
      try {
        const response = await fetch(basePath, {
          cache: "no-store",
        });
        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            data && typeof data === "object" && "message" in data
              ? String((data as { message: unknown }).message)
              : "Display is not available.";
          throw new Error(message);
        }

        if (!cancelled) {
          applyDisplaySession(
            mode === "terminal"
              ? (data as PosTerminal).currentSession
              : (data as PosSession),
          );
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : "Display is not available.",
          );
        }
      }
    }

    void loadInitialSession();

    const socket = io(getPosDisplaySocketUrl(), {
      transports: ["websocket"],
      withCredentials: true,
    });

    socket.on("connect", () => {
      if (!cancelled) {
        setConnected(true);
        socket.emit("pos:display:subscribe", { mode, token });
      }
    });

    socket.on("pos:display:update", (data: DisplayEvent) => {
      if (cancelled) {
        return;
      }

      if (data.kind === "session") {
        applyDisplaySession(data.session, data.preview);
        setError(null);
      }

      if (data.kind === "terminal") {
        applyDisplaySession(data.terminal.currentSession);
        setError(null);
      }

      if (data.kind === "error") {
        setError(data.message ?? "Display is not available.");
      }
    });

    socket.on("pos:display:error", (data: { message?: string }) => {
      if (!cancelled) {
        setError(data.message ?? "Display is not available.");
      }
    });

    socket.on("disconnect", () => {
      if (!cancelled) {
        setConnected(false);
      }
    });

    socket.on("connect_error", () => {
      if (!cancelled) {
        setConnected(false);
      }
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, [applyDisplaySession, mode, token]);

  const itemCount = useMemo(
    () =>
      session?.items.reduce((total, item) => total + Number(item.quantity), 0) ??
      0,
    [session],
  );

  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-semibold uppercase text-red-300">
              Muis Bakery
            </p>
            <h1 className="mt-1 text-3xl font-semibold">Customer display</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-stone-200">
            {connected ? (
              <Wifi className="h-4 w-4 text-emerald-300" />
            ) : (
              <WifiOff className="h-4 w-4 text-amber-300" />
            )}
            {connected ? "Live" : "Reconnecting"}
          </div>
        </header>

        {error ? (
          <section className="flex flex-1 items-center justify-center">
            <div className="max-w-lg rounded-md border border-red-300/30 bg-red-950/40 p-6 text-center">
              <p className="text-lg font-semibold text-red-100">{error}</p>
            </div>
          </section>
        ) : !session ? (
          <section className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-3 text-stone-300">
              {connected ? null : <Loader2 className="h-5 w-5 animate-spin" />}
              Waiting for cashier
            </div>
          </section>
        ) : session.status === "COMPLETED" ? (
          <section className="flex flex-1 items-center justify-center text-center">
            <div>
              <CheckCircle2 className="mx-auto h-16 w-16 text-emerald-300" />
              <p className="mt-6 text-4xl font-semibold">Thank you</p>
              <p className="mt-3 text-xl text-stone-300">
                Sale #{session.completedSale?.saleNumber} completed
              </p>
              <p className="mt-8 text-6xl font-semibold text-emerald-200">
                {formatMoney(session.totalAmount)}
              </p>
            </div>
          </section>
        ) : (
          <section className="grid flex-1 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="rounded-md border border-white/10 bg-white/[0.04]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <h2 className="text-xl font-semibold">Items</h2>
                <span className="text-sm text-stone-300">
                  {itemCount.toLocaleString("en", {
                    maximumFractionDigits: 3,
                  })}{" "}
                  item{itemCount === 1 ? "" : "s"}
                </span>
              </div>

              {session.items.length === 0 ? (
                <div className="flex min-h-80 items-center justify-center px-5 text-center text-stone-400">
                  Waiting for cashier
                </div>
              ) : (
                <div className="divide-y divide-white/10">
                  {session.items.map((item) => (
                    <div
                      className="grid gap-3 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_120px_140px]"
                      key={item.id}
                    >
                      <div>
                        <p className="text-2xl font-semibold">
                          {item.product.name}
                        </p>
                        <p className="mt-1 text-stone-400">
                          {formatMoney(item.unitPrice)} each
                        </p>
                      </div>
                      <p className="text-lg text-stone-200 sm:text-right">
                        {formatQuantity(
                          item.quantity,
                          item.product.unit.abbreviation,
                        )}
                      </p>
                      <p className="text-2xl font-semibold sm:text-right">
                        {formatMoney(item.lineTotal)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <aside className="rounded-md border border-white/10 bg-white/[0.04] p-5">
              <div className="grid gap-4 text-lg">
                <div className="flex justify-between text-stone-300">
                  <span>Subtotal</span>
                  <span>{formatMoney(session.subtotal)}</span>
                </div>
                <div className="flex justify-between text-stone-300">
                  <span>Discount</span>
                  <span>{formatMoney(session.discount)}</span>
                </div>
                <div className="border-t border-white/10 pt-4">
                  <div className="flex justify-between text-2xl font-semibold">
                    <span>Total</span>
                    <span>{formatMoney(session.totalAmount)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-stone-300">
                  <span>Paid</span>
                  <span>{formatMoney(session.amountPaid)}</span>
                </div>
                <div className="flex justify-between text-xl font-semibold text-red-200">
                  <span>Balance</span>
                  <span>{formatMoney(session.balanceDue)}</span>
                </div>
              </div>
            </aside>
          </section>
        )}
      </div>
    </main>
  );
}
