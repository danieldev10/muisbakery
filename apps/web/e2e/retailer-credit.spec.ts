import { expect, test, type Page } from "@playwright/test";

import {
  addAllocatedProduct,
  createRetailer,
  createRetailerApproval,
  createRoleApi,
  createTerminal,
  disableTerminal,
  listBrowserQueuedSales,
  listRetailers,
  newRolePage,
  pairTerminalInBrowser,
  setBrowserOffline,
  waitForOfflineShell,
} from "./support";

async function selectRetailerSale(
  page: Page,
  retailerName: string,
  paymentMethod: "CASH" | "TRANSFER" | "CREDIT",
) {
  await page.locator("#customerType").selectOption("RETAILER");
  await page.locator("#retailerId").selectOption({ label: retailerName });
  await page.locator("aside select").last().selectOption(paymentMethod);
}

async function queueSale(page: Page) {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Queue sale" }).click();
  await (await popupPromise).close();
}

test.describe("offline retailer sales", () => {
  test("credit is tracked locally, paid-now sales remain available, and approvals are single-use", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const retailer = await createRetailer(
      adminApi,
      `E2E Retailer ${Date.now()}`,
    );
    const terminal = await createTerminal(adminApi, {
      name: "E2E Retailer Credit POS",
      pairingCode: "retailer-credit-1001",
      stock: 50,
      retailerId: retailer.id,
      retailerCredit: 100_000,
    });
    const cashier = await newRolePage(browser, "sales");

    try {
      await pairTerminalInBrowser(
        cashier.page,
        terminal.id,
        "retailer-credit-1001",
      );
      await waitForOfflineShell(cashier.page);
      await setBrowserOffline(cashier.context, cashier.page, true);

      await addAllocatedProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CREDIT");
      await queueSale(cashier.page);
      await expect(cashier.page.getByText(/1 pending, 0 need review/)).toBeVisible();
      await expect
        .poll(async () => {
          const [queued] = await listBrowserQueuedSales(cashier.page);

          return queued
            ? {
                ...queued.payload,
                retailerApprovalId:
                  queued.payload.retailerApprovalId ?? null,
              }
            : null;
        })
        .toMatchObject({
          customerType: "RETAILER",
          paymentMethod: "CREDIT",
          retailerId: retailer.id,
          retailerApprovalId: null,
          amountPaid: "0.00",
        });

      await addAllocatedProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CREDIT");
      await expect(
        cashier.page.getByText("Admin approval required for another credit sale."),
      ).toBeVisible();
      await expect(cashier.page.getByRole("button", { name: "Queue sale" })).toBeDisabled();

      await cashier.page.locator("aside select").last().selectOption("CASH");
      await expect(cashier.page.getByRole("button", { name: "Queue sale" })).toBeEnabled();
      await queueSale(cashier.page);

      await addAllocatedProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "TRANSFER");
      await expect(cashier.page.getByRole("button", { name: "Queue sale" })).toBeEnabled();
      await queueSale(cashier.page);
      await expect(cashier.page.getByText(/3 pending, 0 need review/)).toBeVisible();

      await setBrowserOffline(cashier.context, cashier.page, false);
      await expect(cashier.page.getByText(/0 pending, 0 need review, 3 synced/)).toBeVisible({
        timeout: 25_000,
      });

      const syncedRetailer = (await listRetailers(adminApi)).find(
        (entry) => entry.id === retailer.id,
      );
      expect(Number(syncedRetailer?.outstandingBalance)).toBe(1200);
      expect(syncedRetailer?.requiresOrderApproval).toBe(true);

      await createRetailerApproval(adminApi, {
        retailerId: retailer.id,
        terminalId: terminal.id,
        approvedAmount: 2_000,
      });
      await cashier.page.getByRole("button", { name: "Sync now" }).click();
      await expect(cashier.page.getByText("POS is synced.")).toBeVisible();

      await setBrowserOffline(cashier.context, cashier.page, true);
      await addAllocatedProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CREDIT");
      await expect(cashier.page.locator("#retailerApprovalId")).toHaveValue(/.+/);
      await queueSale(cashier.page);

      await addAllocatedProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CREDIT");
      await expect(cashier.page.locator("#retailerApprovalId")).toHaveCount(0);
      await expect(cashier.page.getByRole("button", { name: "Queue sale" })).toBeDisabled();

      await cashier.page.getByTitle("Cancel sale").click();
      await setBrowserOffline(cashier.context, cashier.page, false);
      await expect(cashier.page.getByText(/0 pending, 0 need review, 4 synced/)).toBeVisible({
        timeout: 25_000,
      });

      const afterApproval = (await listRetailers(adminApi)).find(
        (entry) => entry.id === retailer.id,
      );
      expect(
        afterApproval?.orderApprovalRequests.some(
          (approval) =>
            approval.status === "USED" &&
            Boolean(approval.usedAt) &&
            approval.terminal?.id === terminal.id,
        ),
      ).toBe(true);
    } finally {
      await setBrowserOffline(cashier.context, cashier.page, false).catch(
        () => undefined,
      );
      await disableTerminal(adminApi, terminal.id);
      await Promise.all([cashier.context.close(), adminApi.dispose()]);
    }
  });
});
