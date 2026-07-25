import { readFile } from "node:fs/promises";

import {
  request,
  type APIRequestContext,
  type Browser,
  type Download,
  type Page,
} from "@playwright/test";

import { E2E_FIXTURES } from "./fixtures";

export const WEB_ORIGIN = "http://127.0.0.1:3100";
export const API_ORIGIN = "http://127.0.0.1:3101";
export { E2E_FIXTURES };

export type RoleName = keyof typeof E2E_FIXTURES.users;

type SalesCounterResponse = {
  id: string;
  name: string | null;
  isActive: boolean;
};

export type RetailerResponse = {
  id: string;
  name: string;
  outstandingBalance: string;
  requiresOrderApproval: boolean;
  orderApprovals: Array<{
    id: string;
    approvedAmount: string;
    status: string;
    usedAt: string | null;
  }>;
  orderApprovalRequests: Array<{
    id: string;
    approvedAmount: string;
    status: string;
    usedAt: string | null;
  }>;
};

async function responseJson<T>(
  response: Awaited<ReturnType<APIRequestContext["post"]>>,
) {
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
    serviceWorkers: "block",
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await loginInBrowser(page, role);
  return { context, page };
}

export async function createSalesCounter(
  adminApi: APIRequestContext,
  name: string,
) {
  return responseJson<SalesCounterResponse>(
    await adminApi.post("/admin/pos-terminals", { data: { name } }),
  );
}

export async function disableSalesCounter(
  adminApi: APIRequestContext,
  counterId: string,
) {
  await responseJson<SalesCounterResponse>(
    await adminApi.patch(`/admin/pos-terminals/${counterId}`, {
      data: { isActive: false },
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
    approvedAmount: number;
  },
) {
  return responseJson(
    await adminApi.post(
      `/admin/retailers/${input.retailerId}/order-approvals`,
      {
        data: {
          approvedAmount: input.approvedAmount,
          reason: "Online POS browser test approval",
        },
      },
    ),
  );
}

export async function addPrimaryProduct(page: Page, quantity = 1) {
  const product = E2E_FIXTURES.products.primary;
  const productName = `${product.name} - ${product.size}`;
  await page.getByRole("button", { name: new RegExp(productName) }).click();
  const input = page.getByRole("spinbutton", {
    name: `Quantity for ${productName}`,
  });

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
