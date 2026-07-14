import "dotenv/config";

import { Pool } from "pg";

type AllocationAuditRow = {
  productId: string;
  product: string;
  centralRemaining: number;
  allocatedRemaining: number;
  excess: number;
};

type CustodyAuditRow = {
  allocationId: string;
  terminal: string;
  product: string;
  allocatedRemaining: number;
  custodyRemaining: number;
  difference: number;
};

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to audit terminal stock allocations.",
    );
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const custodyTable = await pool.query<{ tableName: string | null }>(`
      SELECT to_regclass('"PosTerminalStockBatch"')::TEXT AS "tableName"
    `);

    if (custodyTable.rows[0]?.tableName) {
      const result = await pool.query<CustodyAuditRow>(`
        WITH allocated AS (
          SELECT
            "id" AS "allocationId",
            "terminalId",
            "productId",
            GREATEST("allocatedQuantity" - "soldQuantity", 0)::INTEGER
              AS "allocatedRemaining"
          FROM "PosTerminalStockAllocation"
        ),
        custody AS (
          SELECT
            "allocationId",
            SUM("quantityRemaining")::INTEGER AS "custodyRemaining"
          FROM "PosTerminalStockBatch"
          GROUP BY "allocationId"
        )
        SELECT
          allocated."allocationId",
          COALESCE(terminal."name", terminal."id") AS terminal,
          CASE
            WHEN product."size" = '' THEN product."name"
            ELSE product."name" || ' (' || product."size" || ')'
          END AS product,
          COALESCE(allocated."allocatedRemaining", 0)::INTEGER
            AS "allocatedRemaining",
          COALESCE(custody."custodyRemaining", 0)::INTEGER
            AS "custodyRemaining",
          (
            COALESCE(custody."custodyRemaining", 0) -
            COALESCE(allocated."allocatedRemaining", 0)
          )::INTEGER AS difference
        FROM "Product" product
        JOIN allocated ON allocated."productId" = product."id"
        JOIN "PosTerminal" terminal ON terminal."id" = allocated."terminalId"
        LEFT JOIN custody ON custody."allocationId" = allocated."allocationId"
        WHERE allocated."allocatedRemaining" <> 0
           OR COALESCE(custody."custodyRemaining", 0) <> 0
        ORDER BY terminal, product."name", product."size"
      `);

      if (result.rows.length === 0) {
        console.log("No POS terminal custody stock was found.");
      } else {
        console.table(result.rows);
      }

      const mismatches = result.rows.filter((row) => row.difference !== 0);

      if (mismatches.length > 0) {
        console.error(
          `\nCustody audit failed: ${mismatches.length} product(s) do not match their aggregate allocation balances. Reconcile these records before changing terminal allocations.`,
        );
        process.exitCode = 1;
      } else {
        console.log(
          "\nCustody audit passed. Aggregate and batch balances match.",
        );
      }

      process.exitCode ??= 0;
      return;
    }

    const result = await pool.query<AllocationAuditRow>(`
      WITH central AS (
        SELECT
          "productId",
          COALESCE(SUM("quantityRemaining"), 0)::INTEGER AS "centralRemaining"
        FROM "SalesProductBatch"
        GROUP BY "productId"
      ),
      allocated AS (
        SELECT
          "productId",
          COALESCE(SUM(GREATEST("allocatedQuantity" - "soldQuantity", 0)), 0)::INTEGER
            AS "allocatedRemaining"
        FROM "PosTerminalStockAllocation"
        GROUP BY "productId"
      )
      SELECT
        product."id" AS "productId",
        CASE
          WHEN product."size" = '' THEN product."name"
          ELSE product."name" || ' (' || product."size" || ')'
        END AS product,
        COALESCE(central."centralRemaining", 0)::INTEGER AS "centralRemaining",
        COALESCE(allocated."allocatedRemaining", 0)::INTEGER AS "allocatedRemaining",
        GREATEST(
          COALESCE(allocated."allocatedRemaining", 0) -
          COALESCE(central."centralRemaining", 0),
          0
        )::INTEGER AS excess
      FROM "Product" product
      LEFT JOIN central ON central."productId" = product."id"
      LEFT JOIN allocated ON allocated."productId" = product."id"
      WHERE COALESCE(allocated."allocatedRemaining", 0) > 0
      ORDER BY product."name", product."size"
    `);

    if (result.rows.length === 0) {
      console.log("No unsold POS terminal allocations were found.");
    } else {
      console.table(result.rows);
    }

    const overallocated = result.rows.filter((row) => row.excess > 0);

    if (overallocated.length > 0) {
      console.error(
        `\nMigration blocked: ${overallocated.length} product(s) are allocated above physical central stock. Reconcile these allocations before deployment.`,
      );
      process.exitCode = 1;
    } else {
      console.log(
        "\nAudit passed. Existing unsold allocations can be transferred into terminal custody.",
      );
    }
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Terminal stock custody audit failed.",
  );
  process.exitCode = 1;
});
