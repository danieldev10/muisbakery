import type {
  ReceiptDocument,
  ReceiptPrintBridgeConfig,
} from "./receipt";

export type ReceiptPrintResult = {
  mode: "bridge" | "browser";
  fallbackReason: string | null;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

export function reserveReceiptPrintFrame() {
  const frame = document.createElement("iframe");

  frame.title = "Receipt print frame";
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.left = "-10000px";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";
  document.body.appendChild(frame);

  return frame;
}

async function printThroughBridge(
  receipt: ReceiptDocument,
  bridge: ReceiptPrintBridgeConfig,
) {
  if (!bridge.url) {
    return false;
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 3_000);
  let response: Response;

  try {
    response = await fetch(`${bridge.url.replace(/\/$/, "")}/print`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(bridge.token ? { authorization: `Bearer ${bridge.token}` } : {}),
      },
      body: JSON.stringify({
        data: bytesToBase64(receipt.escPosData),
        jobName: receipt.filename,
      }),
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Print bridge returned HTTP ${response.status}.`);
  }

  return true;
}

function printThroughBrowser(
  receipt: ReceiptDocument,
  reservedFrame?: HTMLIFrameElement | null,
) {
  const receiptFrame = reservedFrame ?? reserveReceiptPrintFrame();
  const receiptWindow = receiptFrame.contentWindow;

  if (!receiptWindow) {
    receiptFrame.remove();
    return false;
  }

  receiptWindow.document.open();
  receiptWindow.document.write(receipt.html);
  receiptWindow.document.close();

  const cleanup = () => receiptFrame.remove();

  window.setTimeout(() => {
    try {
      receiptWindow.addEventListener("afterprint", cleanup, { once: true });
      receiptWindow.focus();
      receiptWindow.print();
      window.setTimeout(cleanup, 120_000);
    } catch {
      cleanup();
    }
  }, 250);

  return true;
}

export async function printReceipt(
  receipt: ReceiptDocument,
  bridge: ReceiptPrintBridgeConfig,
  reservedFrame?: HTMLIFrameElement | null,
): Promise<ReceiptPrintResult> {
  let fallbackReason: string | null = null;

  if (bridge.url) {
    try {
      if (await printThroughBridge(receipt, bridge)) {
        reservedFrame?.remove();
        return { mode: "bridge", fallbackReason: null };
      }
    } catch (error) {
      fallbackReason =
        error instanceof Error ? error.message : "Direct receipt printer unavailable.";
    }
  }

  printThroughBrowser(receipt, reservedFrame);
  return { mode: "browser", fallbackReason };
}

export function downloadReceipt(receipt: ReceiptDocument) {
  const blob = new Blob([receipt.html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${receipt.filename}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
