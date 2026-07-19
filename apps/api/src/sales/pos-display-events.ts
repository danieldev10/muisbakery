import { Injectable } from "@nestjs/common";
import type { Namespace } from "socket.io";

export type PosDisplayEvent =
  | {
      kind: "session";
      session: unknown;
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
  private readonly terminalPreviews = new Map<string, unknown>();

  attachServer(server: Namespace) {
    this.server = server;
  }

  hasSessionSubscribers(displayToken: string) {
    return this.hasSubscribers(posDisplaySessionRoom(displayToken));
  }

  hasTerminalSubscribers(displayToken: string) {
    return this.hasSubscribers(posDisplayTerminalRoom(displayToken));
  }

  getTerminalPreview(displayToken: string) {
    return this.terminalPreviews.get(displayToken);
  }

  setTerminalPreview(displayToken: string, session: unknown) {
    this.terminalPreviews.set(displayToken, session);
  }

  clearTerminalPreview(displayToken: string) {
    this.terminalPreviews.delete(displayToken);
  }

  emitSessionUpdate(displayToken: string, session: unknown) {
    this.server
      ?.to(posDisplaySessionRoom(displayToken))
      .emit("pos:display:update", {
        kind: "session",
        session,
      });
  }

  emitTerminalUpdate(displayToken: string, terminal: unknown) {
    this.server
      ?.to(posDisplayTerminalRoom(displayToken))
      .emit("pos:display:update", { kind: "terminal", terminal });
  }

  emitTerminalSessionUpdate(displayToken: string, session: unknown) {
    this.server
      ?.to(posDisplayTerminalRoom(displayToken))
      .emit("pos:display:update", {
        kind: "session",
        session,
      });
  }

  private hasSubscribers(room: string) {
    return (this.server?.adapter.rooms.get(room)?.size ?? 0) > 0;
  }
}
