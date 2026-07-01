import { PageHeader } from "@/components/admin/layout";
import type { SalesOptions } from "@/lib/operations/types";
import { apiGet } from "@/lib/server-api";

import { PosTerminal } from "./pos-terminal";

export default async function SalesPosPage() {
  const options = await apiGet<SalesOptions>("/sales/options");

  return (
    <>
      <PageHeader
        title="Point of sale"
        description="Sell from live Sales stock with a customer-facing display."
      />
      <PosTerminal options={options} />
    </>
  );
}
