import { expect, test } from "@playwright/test";

import {
  createRoleApi,
  createSalesCounter,
  disableSalesCounter,
  E2E_FIXTURES,
  newRolePage,
} from "./support";

test.describe("online POS cart", () => {
  test("hydrates cleanly when the browser reports no connection", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const counter = await createSalesCounter(
      adminApi,
      `E2E Hydration Counter ${Date.now()}`,
    );
    const cashier = await newRolePage(browser, "sales");
    const hydrationErrors: string[] = [];

    cashier.page.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.text().includes("Hydration failed")
      ) {
        hydrationErrors.push(message.text());
      }
    });
    cashier.page.on("pageerror", (error) => {
      if (error.message.includes("Hydration failed")) {
        hydrationErrors.push(error.message);
      }
    });

    try {
      await cashier.page.addInitScript(() => {
        Object.defineProperty(window.navigator, "onLine", {
          configurable: true,
          get: () => false,
        });
      });
      await cashier.page.reload();

      await expect(
        cashier.page.getByText("Connection required", { exact: true }),
      ).toBeVisible();
      expect(hydrationErrors).toEqual([]);
    } finally {
      await disableSalesCounter(adminApi, counter.id);
      await Promise.all([cashier.context.close(), adminApi.dispose()]);
    }
  });

  test("does not let a second cashier take over an active counter", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const counter = await createSalesCounter(
      adminApi,
      `E2E Shared Counter ${Date.now()}`,
    );
    const firstCashier = await newRolePage(browser, "sales");
    const secondCashier = await newRolePage(browser, "secondSales");
    const product = E2E_FIXTURES.products.primary;
    const productName = `${product.name} - ${product.size}`;

    try {
      await expect(
        firstCashier.page.getByRole("combobox", {
          name: "Sales counter",
          exact: true,
        }),
      ).toHaveValue(counter.id);
      await expect(
        secondCashier.page.getByRole("combobox", {
          name: "Sales counter",
          exact: true,
        }),
      ).toHaveValue(counter.id);

      await firstCashier.page
        .getByRole("button", { name: new RegExp(productName) })
        .click();
      await expect(
        firstCashier.page.getByRole("spinbutton", {
          name: `${productName} quantity`,
        }),
      ).toHaveValue("1");

      await secondCashier.page
        .getByRole("button", { name: new RegExp(productName) })
        .click();
      await expect(
        secondCashier.page.getByText(
          /sales counter is currently in use by E2E Sales/i,
        ),
      ).toBeVisible();
      await expect(
        firstCashier.page.getByRole("spinbutton", {
          name: `${productName} quantity`,
        }),
      ).toHaveValue("1");

      await secondCashier.page.reload();
      await expect(
        secondCashier.page.locator(`option[value="${counter.id}"]`),
      ).toHaveAttribute("disabled", "");
      await expect(
        secondCashier.page.getByText(
          /all sales counters are currently in use/i,
        ),
      ).toBeVisible();

      await firstCashier.page
        .getByRole("button", { name: "Cancel current sale" })
        .click();
    } finally {
      await disableSalesCounter(adminApi, counter.id);
      await Promise.all([
        firstCashier.context.close(),
        secondCashier.context.close(),
        adminApi.dispose(),
      ]);
    }
  });

  test("renders cart changes before persistence and applies Admin discount pricing", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const product = E2E_FIXTURES.products.secondary;
    await adminApi.patch(`/admin/products/${product.id}`, {
      data: { discountPercent: 10 },
    });
    const counter = await createSalesCounter(
      adminApi,
      `E2E Optimistic Counter ${Date.now()}`,
    );
    const cashier = await newRolePage(browser, "sales");
    let releaseCreateSession = () => {};

    try {
      await expect(
        cashier.page.getByRole("combobox", {
          name: "Sales counter",
          exact: true,
        }),
      ).toHaveValue(counter.id);

      let markCreateStarted = () => {};
      const createStarted = new Promise<void>((resolve) => {
        markCreateStarted = resolve;
      });
      const holdCreateSession = new Promise<void>((resolve) => {
        releaseCreateSession = resolve;
      });

      await cashier.page.route("**/api/sales/pos/sessions", async (route) => {
        if (route.request().method() === "POST") {
          markCreateStarted();
          await holdCreateSession;
        }
        await route.continue();
      });

      await cashier.page
        .getByRole("button", {
          name: new RegExp(`${product.name} - ${product.size}`),
        })
        .click();
      await createStarted;

      await expect(cashier.page.getByText("Active", { exact: true })).toBeVisible();
      await expect(
        cashier.page.getByRole("spinbutton", {
          name: `${product.name} - ${product.size} quantity`,
        }),
      ).toHaveValue("1");
      await expect(
        cashier.page.getByRole("button", { name: "Checkout and print" }),
      ).toBeDisabled();

      releaseCreateSession();
      await expect(
        cashier.page.getByRole("button", { name: "Checkout and print" }),
      ).toBeEnabled();

      await cashier.page
        .getByRole("combobox", { name: "Price", exact: true })
        .selectOption("DISCOUNTED");
      await expect(cashier.page.getByText("₦810.00 each")).toBeVisible();
      await expect(
        cashier.page
          .getByText("Admin product discount", { exact: true })
          .locator(".."),
      ).toContainText("₦90.00");
      await expect(
        cashier.page.getByRole("spinbutton", {
          name: "Discount amount (Sales)",
        }),
      ).toHaveCount(0);
      await expect(
        cashier.page.getByText("Sales discount", { exact: true }),
      ).toHaveCount(0);
      await expect(
        cashier.page.getByText("Total", { exact: true }).locator(".."),
      ).toContainText("₦810.00");

      await cashier.page
        .getByRole("button", { name: "Cancel current sale" })
        .click();
      await expect(
        cashier.page.getByText("Select a product to start the sale."),
      ).toBeVisible();
    } finally {
      releaseCreateSession();
      await disableSalesCounter(adminApi, counter.id);
      await Promise.all([cashier.context.close(), adminApi.dispose()]);
    }
  });
});
