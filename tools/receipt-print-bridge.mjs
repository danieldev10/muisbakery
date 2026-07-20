import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { connect } from "node:net";

const host = process.env.PRINT_BRIDGE_HOST?.trim() || "127.0.0.1";
const port = Number.parseInt(process.env.PRINT_BRIDGE_PORT || "18181", 10);
const token = process.env.PRINT_BRIDGE_TOKEN?.trim() || "";
const target = process.env.PRINT_BRIDGE_TARGET?.trim().toLowerCase() || "cups";
const printerHost = process.env.THERMAL_PRINTER_HOST?.trim() || "";
const printerPort = Number.parseInt(process.env.THERMAL_PRINTER_PORT || "9100", 10);
const printerQueue = process.env.THERMAL_PRINTER_QUEUE?.trim() || "";
const allowedOrigins = new Set(
  (process.env.PRINT_BRIDGE_ALLOWED_ORIGINS ||
    "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);
const maxJobBytes = 128 * 1024;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PRINT_BRIDGE_PORT must be a valid TCP port.");
}

if (!new Set(["127.0.0.1", "::1", "localhost"]).has(host) && !token) {
  throw new Error(
    "PRINT_BRIDGE_TOKEN is required when PRINT_BRIDGE_HOST is not loopback.",
  );
}

if (target === "tcp" && !printerHost) {
  throw new Error("THERMAL_PRINTER_HOST is required for the tcp target.");
}

if (target === "cups" && !printerQueue) {
  throw new Error("THERMAL_PRINTER_QUEUE is required for the cups target.");
}

if (target !== "tcp" && target !== "cups") {
  throw new Error("PRINT_BRIDGE_TARGET must be either tcp or cups.");
}

function applyCors(request, response) {
  const origin = request.headers.origin;

  if (origin && allowedOrigins.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }
  response.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function authorized(request) {
  if (!token) {
    return true;
  }

  const provided = request.headers.authorization?.replace(/^Bearer\s+/i, "") || "";
  const expectedBuffer = Buffer.from(token);
  const providedBuffer = Buffer.from(provided);

  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

async function readJson(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxJobBytes * 2) {
      throw new Error("Receipt print job is too large.");
    }
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function decodeJob(body) {
  if (!body || typeof body !== "object" || typeof body.data !== "string") {
    throw new Error("A base64 ESC/POS data field is required.");
  }

  const data = Buffer.from(body.data, "base64");
  if (data.length === 0 || data.length > maxJobBytes) {
    throw new Error("Receipt print job has an invalid size.");
  }

  return {
    data,
    jobName:
      typeof body.jobName === "string"
        ? body.jobName.replace(/[^a-z0-9_.-]/gi, "-").slice(0, 80)
        : "muis-bakery-receipt",
  };
}

function printTcp(data) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: printerHost, port: printerPort });
    const timeout = setTimeout(() => {
      socket.destroy(new Error("Thermal printer connection timed out."));
    }, 8_000);

    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once("connect", () => socket.end(data));
    socket.once("close", (hadError) => {
      clearTimeout(timeout);
      if (!hadError) {
        resolve();
      }
    });
  });
}

function printCups(data, jobName) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "lp",
      ["-d", printerQueue, "-t", jobName, "-o", "raw"],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    const errors = [];

    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            Buffer.concat(errors).toString("utf8").trim() ||
              `The lp command exited with code ${code}.`,
          ),
        );
      }
    });
    child.stdin.end(data);
  });
}

const server = createServer(async (request, response) => {
  applyCors(request, response);

  const origin = request.headers.origin;
  if (origin && !allowedOrigins.has(origin)) {
    return sendJson(response, 403, { error: "Origin is not allowed." });
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    return response.end();
  }

  if (request.method === "GET" && request.url === "/health") {
    return sendJson(response, 200, { ok: true, target });
  }

  if (request.method !== "POST" || request.url !== "/print") {
    return sendJson(response, 404, { error: "Not found." });
  }

  if (!authorized(request)) {
    return sendJson(response, 401, { error: "Invalid print bridge token." });
  }

  try {
    const job = decodeJob(await readJson(request));
    if (target === "tcp") {
      await printTcp(job.data);
    } else {
      await printCups(job.data, job.jobName);
    }
    return sendJson(response, 200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to print receipt.";
    console.error(`[print-bridge] ${message}`);
    return sendJson(response, 502, { error: message });
  }
});

server.listen(port, host, () => {
  const destination =
    target === "tcp" ? `${printerHost}:${printerPort}` : `CUPS queue ${printerQueue}`;
  console.log(`[print-bridge] Listening on http://${host}:${port}`);
  console.log(`[print-bridge] Printing to ${destination}`);
});
