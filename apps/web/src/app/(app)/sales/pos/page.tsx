import type { SalesOptions } from "@/lib/operations/types";
import { getCurrentUser } from "@/lib/auth";
import { apiGet } from "@/lib/server-api";

import { PosTerminal } from "./pos-terminal";

export default async function SalesPosPage() {
  const [options, user] = await Promise.all([
    apiGet<SalesOptions>("/sales/options"),
    getCurrentUser(),
  ]);
  const cashierName =
    user && typeof user === "object"
      ? (user.name ?? user.email)
      : "Sales cashier";
  const address = process.env.RECEIPT_BUSINESS_ADDRESS?.trim() || null;
  const phone = process.env.RECEIPT_BUSINESS_PHONE?.trim() || null;
  const bridgeUrl = process.env.RECEIPT_PRINT_BRIDGE_URL?.trim() || null;
  const bridgeToken = process.env.RECEIPT_PRINT_BRIDGE_TOKEN?.trim() || null;

  return (
    <PosTerminal
      options={options}
      receiptSettings={{
        business: {
          name: process.env.RECEIPT_BUSINESS_NAME?.trim() || "Muis Bakery",
          address,
          phone,
          returnPolicy:
            process.env.RECEIPT_RETURN_POLICY?.trim() ||
            "Please retain this receipt for returns.",
        },
        bridge: {
          url: bridgeUrl,
          token: bridgeToken,
        },
        cashierName,
      }}
    />
  );
}
