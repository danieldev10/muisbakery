import { expect, test } from "@playwright/test";

import {
  addAllocatedProduct,
  createRoleApi,
  createTerminal,
  disableTerminal,
  downloadText,
  newRolePage,
  pairTerminalInBrowser,
  setBrowserOffline,
  waitForOfflineShell,
} from "./support";

test.describe("offline POS", () => {
  test("queues sales, cold-reloads offline, prints receipts, and synchronizes", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const terminal = await createTerminal(adminApi, {
      name: "E2E Offline Sales POS",
      pairingCode: "offline-sales-1001",
      stock: 30,
    });
    const cashier = await newRolePage(browser, "sales");

    try {
      await pairTerminalInBrowser(
        cashier.page,
        terminal.id,
        "offline-sales-1001",
      );
      await waitForOfflineShell(cashier.page);

      await setBrowserOffline(cashier.context, cashier.page, true);
      await addAllocatedProduct(cashier.page, 2);

      const firstReceiptPopup = cashier.page.waitForEvent("popup");
      await cashier.page.getByRole("button", { name: "Queue sale" }).click();
      const receiptPage = await firstReceiptPopup;
      await expect(receiptPage).toHaveTitle(/Muis Bakery Receipt/);
      await receiptPage.close();
      await expect(cashier.page.getByText(/1 pending, 0 need review/)).toBeVisible();
      await expect(cashier.page.getByText("Last receipt is ready.")).toBeVisible();

      const downloadPromise = cashier.page.waitForEvent("download");
      await cashier.page.getByRole("button", { name: "Download" }).click();
      const receiptText = await downloadText(await downloadPromise);
      expect(receiptText).toContain("Sales receipt");
      expect(receiptText).toContain("E2E Allocated Bread");

      await cashier.page.reload();
      await expect(cashier.page).toHaveURL(/\/sales\/pos$/);
      await expect(cashier.page.getByText("Offline POS")).toBeVisible();
      await expect(cashier.page.getByText("E2E Allocated Bread")).toBeVisible();
      await addAllocatedProduct(cashier.page);
      const secondReceiptPopup = cashier.page.waitForEvent("popup");
      await cashier.page.getByRole("button", { name: "Queue sale" }).click();
      await (await secondReceiptPopup).close();
      await expect(cashier.page.getByText(/2 pending, 0 need review/)).toBeVisible();

      await setBrowserOffline(cashier.context, cashier.page, false);
      await cashier.page.getByRole("button", { name: "Sync now" }).click();
      await expect(cashier.page.getByText(/0 pending, 0 need review, 2 synced/)).toBeVisible({
        timeout: 25_000,
      });
      await expect(cashier.page.getByText("Offline sales synced.")).toBeVisible();
    } finally {
      await setBrowserOffline(cashier.context, cashier.page, false).catch(
        () => undefined,
      );
      await disableTerminal(adminApi, terminal.id);
      await Promise.all([cashier.context.close(), adminApi.dispose()]);
    }
  });

  test("service-worker activation removes older POS caches", async ({ browser }) => {
    const cashier = await newRolePage(browser, "sales");

    try {
      const cacheNames = await cashier.page.evaluate(async () => {
        await caches.open("muisbakery-pos-v1");
        await caches.open("muisbakery-pos-v3");
        const existing = await navigator.serviceWorker.getRegistration();
        await existing?.unregister();
        const registration = await navigator.serviceWorker.register(
          `/sw.js?e2e-upgrade=${Date.now()}`,
          { scope: "/" },
        );

        await new Promise<void>((resolve, reject) => {
          const worker =
            registration.installing ?? registration.waiting ?? registration.active;
          if (!worker || worker.state === "activated") {
            resolve();
            return;
          }
          const timer = window.setTimeout(
            () => reject(new Error("Service worker activation timed out.")),
            15_000,
          );
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated") {
              window.clearTimeout(timer);
              resolve();
            }
          });
        });

        return caches.keys();
      });

      expect(cacheNames).toContain("muisbakery-pos-v4");
      expect(cacheNames).not.toContain("muisbakery-pos-v1");
      expect(cacheNames).not.toContain("muisbakery-pos-v3");
    } finally {
      await cashier.context.close();
    }
  });
});
