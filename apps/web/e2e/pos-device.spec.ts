import { expect, test } from "@playwright/test";

import {
  E2E_FIXTURES,
  clearBrowserDevice,
  createRoleApi,
  createTerminal,
  disableTerminal,
  newRolePage,
  pairTerminalInBrowser,
  rePairTerminal,
  waitForOfflineShell,
} from "./support";

test.describe("POS device enrollment", () => {
  test("a pairing code is single-use and storage loss requires Admin re-pairing", async ({
    browser,
  }) => {
    const adminApi = await createRoleApi("admin");
    const pairingCode = "pair-device-1001";
    const replacementCode = "pair-device-2002";
    const terminal = await createTerminal(adminApi, {
      name: "E2E Device Enrollment POS",
      pairingCode,
      stock: 20,
    });
    const browserA = await newRolePage(browser, "sales");
    const browserB = await newRolePage(browser, "sales");

    try {
      await pairTerminalInBrowser(browserA.page, terminal.id, pairingCode);
      await waitForOfflineShell(browserA.page);
      await expect(
        browserA.page.getByText(E2E_FIXTURES.products.allocated.name),
      ).toBeVisible();
      await expect(
        browserA.page.getByText(E2E_FIXTURES.products.unallocated.name),
      ).toHaveCount(0);

      await browserB.page.getByPlaceholder("POS terminal setup ID").fill(terminal.id);
      await browserB.page.getByPlaceholder("Pairing code").fill(pairingCode);
      await browserB.page.getByRole("button", { name: "Pair terminal" }).click();
      await expect(
        browserB.page.getByText(
          "This POS terminal is already paired. Ask Admin to start re-pairing.",
        ),
      ).toBeVisible();

      await clearBrowserDevice(browserA.context, browserA.page);
      await browserA.page.goto("/login");
      await browserA.page.getByLabel("Email").fill(E2E_FIXTURES.users.sales.email);
      await browserA.page.getByLabel("Password").fill(E2E_FIXTURES.password);
      await browserA.page.getByRole("button", { name: "Sign in" }).click();
      await browserA.page.waitForURL((url) => url.pathname === "/sales/pos");
      await browserA.page.getByPlaceholder("POS terminal setup ID").fill(terminal.id);
      await browserA.page.getByPlaceholder("Pairing code").fill(pairingCode);
      await browserA.page.getByRole("button", { name: "Pair terminal" }).click();
      await expect(
        browserA.page.getByText(
          "This POS terminal is already paired. Ask Admin to start re-pairing.",
        ),
      ).toBeVisible();

      await rePairTerminal(adminApi, terminal.id, replacementCode);
      await browserA.page.getByPlaceholder("Pairing code").fill(replacementCode);
      await browserA.page.getByRole("button", { name: "Pair terminal" }).click();
      await expect(browserA.page.getByText("Online POS")).toBeVisible();
    } finally {
      await disableTerminal(adminApi, terminal.id);
      await Promise.all([
        browserA.context.close(),
        browserB.context.close(),
        adminApi.dispose(),
      ]);
    }
  });
});
