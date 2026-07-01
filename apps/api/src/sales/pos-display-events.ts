import { Injectable } from "@nestjs/common";
import type { Namespace } from "socket.io";

export type PosDisplayEvent =
  | {
      kind: "session";
      session: unknown;
      preview?: boolean;
    }
  | {
      kind: "terminal";
      terminal: unknown;
    };

export function posDisplaySessionRoom(displayToken: string) {
  return `pos-display:session:${displayToken}`;
}

export function posDisplayTerminalRoom(displayToken: string) {
  return `pos-display:terminal:${displayToken}`;
}

@Injectable()
export class PosDisplayEvents {
  private server: Namespace | null = null;

  attachServer(server: Namespace) {
    this.server = server;
  }

  hasSessionSubscribers(displayToken: string) {
    return this.hasSubscribers(posDisplaySessionRoom(displayToken));
  }

  hasTerminalSubscribers(displayToken: string) {
    return this.hasSubscribers(posDisplayTerminalRoom(displayToken));
  }

  emitSessionUpdate(
    displayToken: string,
    session: unknown,
    options?: { preview?: boolean },
  ) {
    this.server
      ?.to(posDisplaySessionRoom(displayToken))
      .emit("pos:display:update", {
        kind: "session",
        preview: options?.preview,
        session,
      });
  }

  emitTerminalUpdate(displayToken: string, terminal: unknown) {
    this.server
      ?.to(posDisplayTerminalRoom(displayToken))
      .emit("pos:display:update", { kind: "terminal", terminal });
  }

  emitTerminalSessionUpdate(
    displayToken: string,
    session: unknown,
    options?: { preview?: boolean },
  ) {
    this.server
      ?.to(posDisplayTerminalRoom(displayToken))
      .emit("pos:display:update", {
        kind: "session",
        preview: options?.preview,
        session,
      });
  }

  private hasSubscribers(room: string) {
    return (this.server?.adapter.rooms.get(room)?.size ?? 0) > 0;
  }
}
