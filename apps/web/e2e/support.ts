import { readFile } from "node:fs/promises";

import {
  expect,
  request,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Download,
  type Page,
} from "@playwright/test";

import { E2E_FIXTURES } from "./fixtures";

export const WEB_ORIGIN = "http://127.0.0.1:3100";
export const API_ORIGIN = "http://127.0.0.1:3101";
export { E2E_FIXTURES };

const E2E_OFFLINE_KEY = "muisbakery.e2e.offline";

export type RoleName = keyof typeof E2E_FIXTURES.users;

type PosTerminalResponse = {
  id: string;
  name: string | null;
};

type RetailerResponse = {
  id: string;
  name: string;
  outstandingBalance: string;
  requiresOrderApproval: boolean;
  orderApprovals: Array<{
    id: string;
    status: string;
    terminal: { id: string } | null;
  }>;
  orderApprovalRequests: Array<{
    id: string;
    status: string;
    usedAt: string | null;
    terminal: { id: string } | null;
  }>;
};

async function responseJson<T>(response: Awaited<ReturnType<APIRequestContext["post"]>>) {
  const body = (await response.json().catch(() => null)) as T | null;

  if (!response.ok()) {
    throw new Error(
      `API ${response.url()} failed (${response.status()}): ${JSON.stringify(body)}`,
    );
  }

  if (body === null) {
    throw new Error(`API ${response.url()} returned no JSON body.`);
  }

  return body;
}

export async function createRoleApi(role: RoleName) {
  const api = await request.newContext({
    baseURL: API_ORIGIN,
    extraHTTPHeaders: { Origin: WEB_ORIGIN },
  });
  const response = await api.post("/auth/login", {
    data: {
      email: E2E_FIXTURES.users[role].email,
      password: E2E_FIXTURES.password,
    },
  });

  await responseJson(response);
  return api;
}

export async function loginInBrowser(page: Page, role: RoleName) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(E2E_FIXTURES.users[role].email);
  await page.getByLabel("Password").fill(E2E_FIXTURES.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const expectedPath =
    role === "admin"
      ? "/admin/dashboard"
      : role === "management"
        ? "/management/dashboard"
        : "/sales/pos";
  await page.waitForURL((url) => url.pathname === expectedPath);
}

export async function newRolePage(browser: Browser, role: RoleName) {
  const context = await browser.newContext({
    serviceWorkers: "allow",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.addInitScript((offlineKey) => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get() {
        try {
          return window.localStorage.getItem(offlineKey) !== "1";
        } catch {
          return true;
        }
      },
    });
  }, E2E_OFFLINE_KEY);
  const page = await context.newPage();
  await loginInBrowser(page, role);
  return { context, page };
}

export async function setBrowserOffline(
  context: BrowserContext,
  page: Page,
  offline: boolean,
) {
  if (offline) {
    await setPosOfflineState(page, true);
    await context.setOffline(true);
    await expect
      .poll(() => page.evaluate(() => window.navigator.onLine))
      .toBe(false);
    await expect(page.getByText("Offline POS")).toBeVisible();
    return;
  }

  await context.setOffline(false);
  await setPosOfflineState(page, false);
  await expect
    .poll(() => page.evaluate(() => window.navigator.onLine))
    .toBe(true);
}

export async function setPosOfflineState(page: Page, offline: boolean) {
  await page.evaluate(({ offlineKey, isOffline }) => {
    if (isOffline) {
      window.localStorage.setItem(offlineKey, "1");
      window.dispatchEvent(new Event("offline"));
      return;
    }

    window.localStorage.removeItem(offlineKey);
    window.dispatchEvent(new Event("online"));
  }, { offlineKey: E2E_OFFLINE_KEY, isOffline: offline });
  await expect
    .poll(() => page.evaluate(() => window.navigator.onLine))
    .toBe(!offline);

  await expect(page.getByText(offline ? "Offline POS" : "Online POS")).toBeVisible();
}

export async function listBrowserQueuedSales(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("muisbakery-pos-offline", 2);

      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Unable to open offline POS storage.")),
      );
    });

    try {
      return await new Promise<
        Array<{
          status: string;
          payload: {
            customerType: string;
            paymentMethod: string;
            retailerId: string | null;
            retailerApprovalId: string | null;
            amountPaid: string;
          };
        }>
      >((resolve, reject) => {
        const transaction = db.transaction("queuedSales", "readonly");
        const request = transaction.objectStore("queuedSales").getAll();

        request.addEventListener("success", () => resolve(request.result));
        request.addEventListener("error", () =>
          reject(request.error ?? new Error("Unable to read queued POS sales.")),
        );
      });
    } finally {
      db.close();
    }
  });
}

export async function createTerminal(
  adminApi: APIRequestContext,
  input: {
    name: string;
    pairingCode: string;
    stock?: number;
    retailerId?: string;
    retailerCredit?: number;
  },
) {
  const terminal = await responseJson<PosTerminalResponse>(
    await adminApi.post("/admin/pos-terminals", {
      data: {
        name: input.name,
        pairingCode: input.pairingCode,
        offlineEnabled: true,
      },
    }),
  );

  if (input.stock !== undefined) {
    await responseJson(
      await adminApi.post(
        `/admin/pos-terminals/${terminal.id}/stock-allocations`,
        {
          data: {
            productId: E2E_FIXTURES.products.allocated.id,
            allocatedQuantity: input.stock,
          },
        },
      ),
    );
  }

  if (input.retailerId && input.retailerCredit !== undefined) {
    await responseJson(
      await adminApi.post(
        `/admin/pos-terminals/${terminal.id}/retailer-credit-allocations`,
        {
          data: {
            retailerId: input.retailerId,
            allocatedAmount: input.retailerCredit,
            isActive: true,
          },
        },
      ),
    );
  }

  return terminal;
}

export async function rePairTerminal(
  adminApi: APIRequestContext,
  terminalId: string,
  pairingCode: string,
) {
  return responseJson<PosTerminalResponse>(
    await adminApi.post(`/admin/pos-terminals/${terminalId}/re-pair`, {
      data: { pairingCode },
    }),
  );
}

export async function disableTerminal(
  adminApi: APIRequestContext,
  terminalId: string,
) {
  const terminals = await responseJson<
    Array<{ id: string; name: string | null; offlineEnabled: boolean }>
  >(await adminApi.get("/admin/pos-terminals"));
  const terminal = terminals.find((entry) => entry.id === terminalId);

  if (!terminal) {
    return;
  }

  await responseJson(
    await adminApi.patch(`/admin/pos-terminals/${terminalId}`, {
      data: {
        name: terminal.name,
        isActive: false,
        offlineEnabled: terminal.offlineEnabled,
      },
    }),
  );
}

export async function createRetailer(
  adminApi: APIRequestContext,
  name: string,
) {
  return responseJson<RetailerResponse>(
    await adminApi.post("/admin/retailers", { data: { name } }),
  );
}

export async function createRetailerApproval(
  adminApi: APIRequestContext,
  input: {
    retailerId: string;
    terminalId: string;
    approvedAmount: number;
  },
) {
  return responseJson(
    await adminApi.post(
      `/admin/retailers/${input.retailerId}/order-approvals`,
      {
        data: {
          approvedAmount: input.approvedAmount,
          terminalId: input.terminalId,
          reason: "Stage 3 browser test approval",
        },
      },
    ),
  );
}

export async function pairTerminalInBrowser(
  page: Page,
  terminalId: string,
  pairingCode: string,
) {
  await page.goto("/sales/pos");
  await expect(page.getByText("Terminal setup required")).toBeVisible();
  await page.getByPlaceholder("POS terminal setup ID").fill(terminalId);
  await page.getByPlaceholder("Pairing code").fill(pairingCode);
  await page.getByRole("button", { name: "Pair terminal" }).click();
  await expect(page.getByText("Terminal setup required")).toBeHidden();
  await expect(page.getByText("Online POS")).toBeVisible();
}

export async function waitForOfflineShell(page: Page) {
  await expect(page.getByText("Offline reload ready")).toBeVisible({
    timeout: 20_000,
  });
}

export async function clearBrowserDevice(
  context: BrowserContext,
  page: Page,
) {
  await page.evaluate(async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();

    const databases = await indexedDB.databases();
    await Promise.all(
      databases
        .map((database) => database.name)
        .filter((name): name is string => Boolean(name))
        .map(
          (name) =>
            new Promise<void>((resolve) => {
              const request = indexedDB.deleteDatabase(name);
              request.addEventListener("success", () => resolve());
              request.addEventListener("error", () => resolve());
              request.addEventListener("blocked", () => resolve());
            }),
        ),
    );

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
  });
  await context.clearCookies();
}

export async function addAllocatedProduct(page: Page, quantity = 1) {
  const productName = `${E2E_FIXTURES.products.allocated.name} - ${E2E_FIXTURES.products.allocated.size}`;
  await page.getByRole("button", { name: new RegExp(productName) }).click();
  const input = page.getByRole("spinbutton", {
    name: `Quantity for ${productName}`,
  });
  await expect(input).toBeVisible();

  if (quantity !== 1) {
    await input.fill(String(quantity));
  }
}

export async function downloadText(download: Download) {
  const path = await download.path();
  if (!path) {
    throw new Error("Playwright did not provide a downloaded file path.");
  }
  return readFile(path, "utf8");
}

export async function listRetailers(api: APIRequestContext) {
  return responseJson<RetailerResponse[]>(await api.get("/sales/retailers"));
}

export async function apiPost<T>(
  api: APIRequestContext,
  path: string,
  data: unknown,
) {
  return responseJson<T>(await api.post(path, { data }));
}
