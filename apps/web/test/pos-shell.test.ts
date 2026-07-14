import assert from "node:assert/strict";
import { test } from "node:test";

import { requestPosShellStatus } from "../src/lib/pos-shell";

test("POS shell readiness is requested from the service worker", async () => {
  const worker = {
    postMessage(message: unknown, transfer: Transferable[]) {
      assert.deepEqual(message, { type: "CHECK_POS_SHELL" });

      const port = transfer[0] as MessagePort;
      port.postMessage({ ready: true });
      port.close();
    },
  };

  assert.deepEqual(
    await requestPosShellStatus(worker, "CHECK_POS_SHELL"),
    { ready: true },
  );
});
