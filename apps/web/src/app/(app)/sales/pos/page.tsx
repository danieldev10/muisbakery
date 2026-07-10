import type { SalesOptions } from "@/lib/operations/types";
import { apiGet } from "@/lib/server-api";

import { PosTerminal } from "./pos-terminal";

export default async function SalesPosPage() {
  const options = await apiGet<SalesOptions>("/sales/options");

  return <PosTerminal options={options} />;
}
