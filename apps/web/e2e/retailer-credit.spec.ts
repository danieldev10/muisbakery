import { expect, test, type Page } from "@playwright/test";

import {
  addPrimaryProduct,
  createRetailer,
  createRetailerApproval,
  createRoleApi,
  createSalesCounter,
  disableSalesCounter,
  listRetailers,
  newRolePage,
} from "./support";

async function selectRetailerSale(
  page: Page,
  retailerName: string,
  paymentMethod: "CASH" | "TRANSFER" | "CREDIT",
) {
  await page
    .getByRole("combobox", { name: "Customer type", exact: true })
    .selectOption("RETAILER");
  await page
    .getByRole("combobox", { name: "Retailer", exact: true })
    .selectOption({ label: retailerName });
  await page
    .getByRole("combobox", { name: "Payment", exact: true })
    .selectOption(paymentMethod);
}

async function checkout(page: Page) {
  const button = page.getByRole("button", { name: "Checkout and print" });
  await button.click();
  await expect(button).toBeHidden();
  await expect(page.getByText(/Sale #\d+ completed\./)).toBeVisible();
}

test.describe("online retailer sales", () => {
  test("repeat credit requires single-use Admin approval while paid sales remain available", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const retailer = await createRetailer(
      adminApi,
      `E2E Retailer ${Date.now()}`,
    );
    const counter = await createSalesCounter(
      adminApi,
      `E2E Retailer Counter ${Date.now()}`,
    );
    const cashier = await newRolePage(browser, "sales");

    try {
      await expect(
        cashier.page.getByRole("combobox", {
          name: "Sales counter",
          exact: true,
        }),
      ).toHaveValue(counter.id);

      await addPrimaryProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CREDIT");
      await checkout(cashier.page);

      const afterFirstCredit = (await listRetailers(adminApi)).find(
        (entry) => entry.id === retailer.id,
      );
      expect(Number(afterFirstCredit?.outstandingBalance)).toBe(1_200);
      expect(afterFirstCredit?.requiresOrderApproval).toBe(true);

      await addPrimaryProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CREDIT");
      await expect(
        cashier.page.getByText("Admin approval required"),
      ).toBeVisible();
      await expect(
        cashier.page.getByRole("button", { name: "Checkout and print" }),
      ).toBeDisabled();

      await cashier.page
        .getByRole("button", { name: "Request Admin approval" })
        .click();
      await expect(
        cashier.page.getByText("Approval request sent to Admin."),
      ).toBeVisible();

      const approval = (await createRetailerApproval(adminApi, {
        retailerId: retailer.id,
        approvedAmount: 2_000,
      })) as { id: string };

      await cashier.page
        .getByRole("button", { name: "Refresh approval status" })
        .click();
      await expect(
        cashier.page.getByText(
          "Admin approval received. Select it to continue.",
        ),
      ).toBeVisible();
      await cashier.page
        .getByRole("combobox", { name: "Approved order", exact: true })
        .selectOption(approval.id);
      await checkout(cashier.page);

      const afterApproval = (await listRetailers(adminApi)).find(
        (entry) => entry.id === retailer.id,
      );
      expect(
        afterApproval?.orderApprovalRequests.some(
          (entry) =>
            entry.id === approval.id &&
            entry.status === "USED" &&
            Boolean(entry.usedAt),
        ),
      ).toBe(true);

      await addPrimaryProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "CASH");
      await expect(
        cashier.page.getByRole("button", { name: "Checkout and print" }),
      ).toBeEnabled();
      await checkout(cashier.page);

      await addPrimaryProduct(cashier.page);
      await selectRetailerSale(cashier.page, retailer.name, "TRANSFER");
      await expect(
        cashier.page.getByRole("button", { name: "Checkout and print" }),
      ).toBeEnabled();
      await checkout(cashier.page);
    } finally {
      await disableSalesCounter(adminApi, counter.id);
      await Promise.all([cashier.context.close(), adminApi.dispose()]);
    }
  });
});
