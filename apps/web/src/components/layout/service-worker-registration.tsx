"use client";

import { useEffect } from "react";

import {
  POS_PATH,
  POS_SHELL_STATUS_EVENT,
  requestPosShellStatus,
  type PosShellStatus,
} from "@/lib/pos-shell";

function reportPosShellStatus(status: PosShellStatus) {
  window.dispatchEvent(
    new CustomEvent<PosShellStatus>(POS_SHELL_STATUS_EVENT, {
      detail: status,
    }),
  );
}

async function waitForController(registration: ServiceWorkerRegistration) {
  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  if (!registration.active) {
    return null;
  }

  return new Promise<ServiceWorker | null>((resolve) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      resolve(registration.active);
    }, 5_000);

    function handleControllerChange() {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange,
      );
      resolve(navigator.serviceWorker.controller ?? registration.active);
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange,
    );
  });
}

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const isLocalHost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (process.env.NODE_ENV !== "production" && !isLocalHost) {
      return;
    }

    void navigator.serviceWorker
      .register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      })
      .then(async (registration) => {
        if (window.location.pathname !== POS_PATH) {
          return;
        }

        reportPosShellStatus({ ready: false });
        await registration.update().catch(() => undefined);
        const readyRegistration = await navigator.serviceWorker.ready;
        const worker = await waitForController(readyRegistration);

        if (!worker) {
          throw new Error("The service worker is not controlling this page yet.");
        }

        const status = await requestPosShellStatus(worker, "CACHE_POS_SHELL");

        reportPosShellStatus(status);
      })
      .catch((caught) => {
        reportPosShellStatus({
          ready: false,
          message:
            caught instanceof Error
              ? caught.message
              : "Unable to prepare offline POS.",
        });
      });
  }, []);

  return null;
}
