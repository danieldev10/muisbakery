import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

type WorkerEvent = {
  waitUntil(promise: Promise<unknown>): void;
};

test("the current service worker removes superseded POS caches on activation", async () => {
  const source = await readFile(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  const listeners = new Map<string, (event: WorkerEvent) => void>();
  const deleted: string[] = [];
  let claimed = false;

  const worker = {
    addEventListener(type: string, listener: (event: WorkerEvent) => void) {
      listeners.set(type, listener);
    },
    clients: {
      async claim() {
        claimed = true;
      },
    },
    async skipWaiting() {},
  };
  const cacheStorage = {
    async delete(key: string) {
      deleted.push(key);
      return true;
    },
    async keys() {
      return [
        "muisbakery-pos-v3",
        "muisbakery-pos-v4",
        "unrelated-cache",
      ];
    },
  };

  runInNewContext(source, {
    caches: cacheStorage,
    console,
    fetch: async () => {
      throw new Error("Unexpected fetch during activation test.");
    },
    Response,
    self: worker,
    URL,
  });

  const activate = listeners.get("activate");
  assert.ok(activate, "service worker should register an activate handler");

  let activation: Promise<unknown> | null = null;
  activate({
    waitUntil(promise) {
      activation = promise;
    },
  });

  assert.ok(activation, "activation should wait for cache cleanup");
  await activation;

  assert.deepEqual(deleted, ["muisbakery-pos-v3"]);
  assert.equal(claimed, true);
});
