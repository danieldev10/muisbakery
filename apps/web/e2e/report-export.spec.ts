import { expect, test } from "@playwright/test";

import {
  E2E_FIXTURES,
  apiPost,
  createRetailer,
  createRoleApi,
  downloadText,
  newRolePage,
} from "./support";

function yesterday() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

test.describe("report exports", () => {
  test("CSV downloads neutralize spreadsheet formulas from user-controlled data", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const salesApi = await createRoleApi("sales");
    const reportDate = yesterday();
    const retailer = await createRetailer(
      adminApi,
      `=HYPERLINK("https://example.invalid","E2E")-${Date.now()}`,
    );

    await apiPost(salesApi, "/sales/sales", {
      customerType: "RETAILER",
      retailerId: retailer.id,
      paymentMethod: "CASH",
      soldAt: `${reportDate}T12:00:00.000Z`,
      items: [
        {
          productId: E2E_FIXTURES.products.reports.id,
          quantity: 1,
        },
      ],
    });
    const cashier = await newRolePage(browser, "sales");

    try {
      await cashier.page.goto(`/sales/daily-summary?date=${reportDate}`);
      const downloadPromise = cashier.page.waitForEvent("download");
      await cashier.page.getByRole("button", { name: "CSV" }).click();
      const csv = await downloadText(await downloadPromise);

      expect(csv).toContain("'=HYPERLINK");
      expect(csv).not.toMatch(/(?:^|,)\s*=HYPERLINK/m);
      expect(csv).toContain("E2E Report Bread");
    } finally {
      await Promise.all([
        cashier.context.close(),
        adminApi.dispose(),
        salesApi.dispose(),
      ]);
    }
  });
});
