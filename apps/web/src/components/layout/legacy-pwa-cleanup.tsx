"use client";

import { useEffect } from "react";

const CLEANUP_RELOAD_KEY = "muisbakery.legacyPwaCleanupReloaded";

export function LegacyPwaCleanup() {
  useEffect(() => {
    async function removeLegacyPwaState() {
      const wasControlled =
        "serviceWorker" in navigator &&
        Boolean(navigator.serviceWorker.controller);
      const legacyKeys = [
        "muisbakery.posTerminalId",
        "muisbakery.posTerminalSecret",
        "muisbakery.posSessionId",
      ];

      for (const key of legacyKeys) {
        window.localStorage.removeItem(key);
      }

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(
          registrations.map((registration) => registration.unregister()),
        );
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("muisbakery-pos-"))
            .map((key) => caches.delete(key)),
        );
      }

      if ("indexedDB" in window) {
        window.indexedDB.deleteDatabase("muisbakery-pos-offline");
      }

      if (
        wasControlled &&
        window.sessionStorage.getItem(CLEANUP_RELOAD_KEY) !== "1"
      ) {
        window.sessionStorage.setItem(CLEANUP_RELOAD_KEY, "1");
        window.location.reload();
      }
    }

    void removeLegacyPwaState();
  }, []);

  return null;
}
