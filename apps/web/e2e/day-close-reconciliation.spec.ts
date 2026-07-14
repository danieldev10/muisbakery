import { expect, test } from "@playwright/test";

import {
  addAllocatedProduct,
  createRoleApi,
  createTerminal,
  disableTerminal,
  newRolePage,
  pairTerminalInBrowser,
  setPosOfflineState,
  waitForOfflineShell,
} from "./support";

function localDateInputValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

test.describe("terminal-aware day close", () => {
  test("a disconnected terminal blocks close and a late sale enters reconciliation after audited override", async ({
    browser,
  }) => {
    const date = localDateInputValue();
    const adminApi = await createRoleApi("admin");
    const terminal = await createTerminal(adminApi, {
      name: "E2E Day Close POS",
      pairingCode: "day-close-1001",
      stock: 20,
    });
    const cashier = await newRolePage(browser, "sales");
    const closeOperator = await newRolePage(browser, "sales");
    const manager = await newRolePage(browser, "management");
    const admin = await newRolePage(browser, "admin");

    try {
      await pairTerminalInBrowser(cashier.page, terminal.id, "day-close-1001");
      await waitForOfflineShell(cashier.page);
      await setPosOfflineState(cashier.page, true);
      await addAllocatedProduct(cashier.page);
      const popupPromise = cashier.page.waitForEvent("popup");
      await cashier.page.getByRole("button", { name: "Queue sale" }).click();
      await (await popupPromise).close();
      await expect(cashier.page.getByText(/1 pending, 0 need review/)).toBeVisible();

      await closeOperator.page.goto(`/sales/daily-summary?date=${date}`);
      await closeOperator.page.getByRole("button", { name: "Start day close" }).click();
      const startDialog = closeOperator.page
        .getByRole("dialog")
        .filter({ has: closeOperator.page.getByRole("heading", { name: "Start day close" }) });
      await startDialog.getByRole("button", { name: "Start close" }).click();
      await expect(startDialog).toBeHidden();
      await closeOperator.page.reload();
      await expect(closeOperator.page.getByText(/POS readiness: 0 of 1 terminal/)).toBeVisible();
      await expect(
        closeOperator.page.getByText(/Sales submission remains blocked/),
      ).toBeVisible();

      await manager.page.goto(`/management/sales?from=${date}&to=${date}`);
      await expect(manager.page.getByText(/Day close waiting/)).toBeVisible();
      await manager.page.getByRole("button", { name: "Management override" }).click();
      const overrideDialog = manager.page
        .getByRole("dialog")
        .filter({
          has: manager.page.getByRole("heading", {
            name: "Override terminal readiness",
          }),
        });
      await expect(overrideDialog.getByText("E2E Day Close POS")).toBeVisible();
      await overrideDialog
        .getByLabel("Override reason")
        .fill("Terminal was isolated for the Stage 3 late-sale reconciliation test.");
      await overrideDialog.getByRole("button", { name: "Record override" }).click();
      await expect(overrideDialog).toBeHidden();
      await manager.page.reload();
      await expect(manager.page.getByText("Management override")).toBeVisible();

      await closeOperator.page.reload();
      await closeOperator.page.getByRole("button", { name: "Close this day" }).click();
      const submitDialog = closeOperator.page
        .getByRole("dialog")
        .filter({ has: closeOperator.page.getByRole("heading", { name: "Close this day" }) });
      await submitDialog.getByLabel("Counted cash").fill("0");
      await submitDialog.getByRole("button", { name: "Submit close" }).click();
      await expect(submitDialog).toBeHidden();
      await closeOperator.page.reload();
      await expect(closeOperator.page.getByText("Awaiting Management review")).toBeVisible();

      await manager.page.reload();
      await manager.page.getByRole("button", { name: "Review" }).click();
      const approvalDialog = manager.page
        .getByRole("dialog")
        .filter({ has: manager.page.getByRole("heading", { name: "Approve day close" }) });
      await approvalDialog.getByLabel("Review notes").fill("Stage 3 approved close.");
      await approvalDialog.getByRole("button", { name: "Approve close" }).click();
      await expect(approvalDialog).toBeHidden();
      await manager.page.reload();
      await expect(manager.page.getByText("Approved")).toBeVisible();

      await setPosOfflineState(cashier.page, false);
      await expect(cashier.page.getByText(/1 need review/)).toBeVisible({
        timeout: 25_000,
      });
      await expect(
        cashier.page.getByText(/closed business day|day close/i),
      ).toBeVisible();

      await admin.page.goto(`/admin/pos-sync?q=${terminal.id}`);
      await expect(admin.page.getByText("DAY_CLOSE_LOCKED")).toBeVisible();
      await expect(
        admin.page.getByRole("table").getByText("E2E Day Close POS"),
      ).toBeVisible();

      await manager.page.goto(`/management/sales?from=${date}&to=${date}`);
      await manager.page.getByRole("button", { name: "Reopen" }).click();
      const reopenDialog = manager.page
        .getByRole("dialog")
        .filter({ has: manager.page.getByRole("heading", { name: "Reopen business day" }) });
      await reopenDialog
        .getByLabel("Reason")
        .fill("Reopen after Stage 3 late-sale reconciliation verification.");
      await reopenDialog.getByRole("button", { name: "Reopen day" }).click();
      await expect(reopenDialog).toBeHidden();
      await manager.page.reload();
      await expect(manager.page.getByText("Reopened")).toBeVisible();
    } finally {
      await setPosOfflineState(cashier.page, false).catch(
        () => undefined,
      );
      await disableTerminal(adminApi, terminal.id);
      await Promise.all([
        cashier.context.close(),
        closeOperator.context.close(),
        manager.context.close(),
        admin.context.close(),
        adminApi.dispose(),
      ]);
    }
  });
});
