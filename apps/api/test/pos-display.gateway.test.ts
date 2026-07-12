import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MESSAGE_MAPPING_METADATA,
  MESSAGE_METADATA,
} from "@nestjs/websockets/constants";

import { PosDisplayGateway } from "../src/sales/pos-display.gateway";

function mappedMessages() {
  return Object.getOwnPropertyNames(PosDisplayGateway.prototype)
    .map((property) => {
      const handler = PosDisplayGateway.prototype[
        property as keyof PosDisplayGateway
      ];

      if (typeof handler !== "function") {
        return null;
      }

      return Reflect.getMetadata(MESSAGE_MAPPING_METADATA, handler)
        ? Reflect.getMetadata(MESSAGE_METADATA, handler)
        : null;
    })
    .filter((message): message is string => typeof message === "string");
}

test("POS display gateway only accepts server-validated subscribe messages", () => {
  const messages = mappedMessages();

  assert.deepEqual(messages, ["pos:display:subscribe"]);
  assert.equal(messages.includes("pos:display:preview"), false);
});
