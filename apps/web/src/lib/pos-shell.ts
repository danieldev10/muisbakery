export type PosShellStatus = {
  ready: boolean;
  message?: string;
};

export type PosShellMessageType = "CACHE_POS_SHELL" | "CHECK_POS_SHELL";

export const POS_PATH = "/sales/pos";
export const POS_SHELL_STATUS_EVENT = "muisbakery:pos-shell-status";

type PosShellMessageTarget = {
  postMessage(message: unknown, transfer: Transferable[]): void;
};

export function requestPosShellStatus(
  worker: PosShellMessageTarget,
  type: PosShellMessageType,
) {
  return new Promise<PosShellStatus>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = globalThis.setTimeout(() => {
      channel.port1.close();
      reject(new Error("Timed out while preparing the offline POS shell."));
    }, 10_000);

    channel.port1.addEventListener("message", (event) => {
      globalThis.clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data as PosShellStatus);
    });
    channel.port1.start();

    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (caught) {
      globalThis.clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
      reject(caught);
    }
  });
}
