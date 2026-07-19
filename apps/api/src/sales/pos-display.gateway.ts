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

import { isWebOriginAllowed } from "../config/env";
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Display is not available.";
}

@WebSocketGateway({
  namespace: "/sales/pos/display",
  cors: {
    // Railway remains exact-origin. Local Docker can also be opened through
    // the host's private LAN or Tailscale IPv4 address.
    origin(origin, callback) {
      callback(null, isWebOriginAllowed(origin));
    },
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
}
