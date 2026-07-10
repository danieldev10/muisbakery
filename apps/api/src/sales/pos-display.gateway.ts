import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayInit,
} from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";

import { getWebOrigin } from "../config/env";
import {
  PosDisplayEvents,
  posDisplaySessionRoom,
  posDisplayTerminalRoom,
} from "./pos-display-events";
import { SalesService } from "./sales.service";

type DisplaySubscribePayload = {
  mode?: unknown;
  token?: unknown;
};

type DisplayPreviewPayload = DisplaySubscribePayload & {
  session?: unknown;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Display is not available.";
}

@WebSocketGateway({
  namespace: "/sales/pos/display",
  cors: {
    // Same origin the HTTP API trusts — the customer display pages are
    // served from the web app, so nothing else needs socket access.
    origin: getWebOrigin(),
    credentials: true,
  },
})
export class PosDisplayGateway implements OnGatewayInit {
  @WebSocketServer()
  private server!: Namespace;

  constructor(
    @Inject(SalesService)
    private readonly sales: SalesService,
    @Inject(PosDisplayEvents)
    private readonly displayEvents: PosDisplayEvents,
  ) {}

  afterInit(server: Namespace) {
    this.displayEvents.attachServer(server);
  }

  @SubscribeMessage("pos:display:subscribe")
  async subscribe(
    @MessageBody() payload: DisplaySubscribePayload | undefined,
    @ConnectedSocket() client: Socket,
  ) {
    const token = typeof payload?.token === "string" ? payload.token.trim() : "";
    const mode = payload?.mode === "terminal" ? "terminal" : "session";

    if (!token) {
      client.emit("pos:display:error", {
        message: "Display token is required.",
      });
      return { ok: false };
    }

    const room =
      mode === "terminal"
        ? posDisplayTerminalRoom(token)
        : posDisplaySessionRoom(token);

    await client.join(room);

    try {
      if (mode === "terminal") {
        const terminal = await this.sales.getPosTerminalDisplay(token);
        client.emit("pos:display:update", { kind: "terminal", terminal });
        return { ok: true };
      }

      const session = await this.sales.getPosDisplay(token);
      client.emit("pos:display:update", { kind: "session", session });
      return { ok: true };
    } catch (error) {
      await client.leave(room);
      client.emit("pos:display:error", { message: errorMessage(error) });
      return { ok: false };
    }
  }

  @SubscribeMessage("pos:display:preview")
  preview(@MessageBody() payload: DisplayPreviewPayload | undefined) {
    const token = typeof payload?.token === "string" ? payload.token.trim() : "";
    const mode = payload?.mode === "session" ? "session" : "terminal";
    const session = payload?.session;

    if (!token || !session || typeof session !== "object") {
      return { ok: false };
    }

    if (mode === "session") {
      this.displayEvents.emitSessionUpdate(token, session, { preview: true });
      return { ok: true };
    }

    this.displayEvents.emitTerminalSessionUpdate(token, session, {
      preview: true,
    });
    return { ok: true };
  }
}
