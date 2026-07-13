"use client";

import { useEffect } from "react";

type PosShellStatus = {
  ready: boolean;
  message?: string;
};

const POS_PATH = "/sales/pos";
const POS_SHELL_STATUS_EVENT = "muisbakery:pos-shell-status";

function reportPosShellStatus(status: PosShellStatus) {
  window.dispatchEvent(
    new CustomEvent<PosShellStatus>(POS_SHELL_STATUS_EVENT, {
      detail: status,
    }),
  );
}

function requestPosShellStatus(
  worker: ServiceWorker,
  type: "CACHE_POS_SHELL" | "CHECK_POS_SHELL",
) {
  return new Promise<PosShellStatus>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("Timed out while preparing the offline POS shell."));
    }, 10_000);

    channel.port1.addEventListener("message", (event) => {
      window.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data as PosShellStatus);
    });
    channel.port1.start();
    worker.postMessage({ type }, [channel.port2]);
  });
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
