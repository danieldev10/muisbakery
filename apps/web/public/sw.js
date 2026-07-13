const CACHE_NAME = "muisbakery-pos-v3";
const POS_PATH = "/sales/pos";
const SHELL_PATHS = ["/logo.JPG", "/manifest.webmanifest"];
const OFFLINE_POS_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Muis Bakery POS offline setup required</title>
    <style>
      body {
        align-items: center;
        background: #faf7f1;
        color: #1c1917;
        display: flex;
        font-family: Arial, sans-serif;
        justify-content: center;
        margin: 0;
        min-height: 100vh;
        padding: 24px;
      }
      main {
        background: #fff;
        border: 1px solid #e7dfd4;
        border-radius: 8px;
        box-shadow: 0 12px 40px rgba(41, 31, 25, 0.12);
        max-width: 520px;
        padding: 24px;
      }
      h1 {
        color: #8f2636;
        font-size: 22px;
        margin: 0 0 12px;
      }
      p {
        font-size: 15px;
        line-height: 1.6;
        margin: 0 0 10px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Online setup required</h1>
      <p>
        This browser does not have the cached POS shell needed to start while
        offline.
      </p>
      <p>
        Connect to the internet once, open Point of Sale, pair the terminal,
        and refresh the offline stock snapshot before selling offline.
      </p>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PATHS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) => key.startsWith("muisbakery-pos-") && key !== CACHE_NAME,
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function shouldHandle(requestUrl) {
  if (requestUrl.origin !== self.location.origin) {
    return false;
  }

  if (requestUrl.pathname.startsWith("/api/")) {
    return false;
  }

  return (
    requestUrl.pathname === POS_PATH ||
    requestUrl.pathname === "/logo.JPG" ||
    requestUrl.pathname === "/manifest.webmanifest" ||
    requestUrl.pathname === "/_next/image" ||
    requestUrl.pathname.startsWith("/_next/static/")
  );
}

function isPosNavigation(event, requestUrl) {
  return event.request.mode === "navigate" && requestUrl.pathname === POS_PATH;
}

function shouldCacheResponse(requestUrl, response) {
  if (!response || !response.ok || response.redirected) {
    return false;
  }

  if (requestUrl.pathname !== POS_PATH) {
    return true;
  }

  const responseUrl = new URL(response.url);
  const contentType = response.headers.get("content-type") ?? "";

  return (
    responseUrl.origin === self.location.origin &&
    responseUrl.pathname === POS_PATH &&
    contentType.includes("text/html")
  );
}

async function offlinePosResponse() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(POS_PATH, { ignoreVary: true });

  if (cached) {
    return cached;
  }

  return new Response(OFFLINE_POS_FALLBACK_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function cachePosShell() {
  const requestUrl = new URL(POS_PATH, self.location.origin);
  const response = await fetch(POS_PATH, {
    cache: "no-store",
    credentials: "include",
  });

  if (!shouldCacheResponse(requestUrl, response)) {
    return;
  }

  const cache = await caches.open(CACHE_NAME);

  await cache.put(POS_PATH, response.clone());
}

self.addEventListener("message", (event) => {
  if (
    event.data?.type !== "CACHE_POS_SHELL" &&
    event.data?.type !== "CHECK_POS_SHELL"
  ) {
    return;
  }

  const responsePort = event.ports[0];

  event.waitUntil(
    (async () => {
      try {
        if (event.data.type === "CACHE_POS_SHELL") {
          await cachePosShell().catch(() => undefined);
        }

        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(POS_PATH, { ignoreVary: true });

        responsePort?.postMessage({ ready: Boolean(cached) });
      } catch (caught) {
        responsePort?.postMessage({
          ready: false,
          message:
            caught instanceof Error
              ? caught.message
              : "Unable to cache the offline POS shell.",
        });
      }
    })(),
  );
});

async function cachedResponse(request) {
  const cache = await caches.open(CACHE_NAME);

  return cache.match(request);
}

async function handleRequest(event, requestUrl) {
  try {
    const response = await fetch(event.request);

    if (shouldCacheResponse(requestUrl, response)) {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = requestUrl.pathname === POS_PATH ? POS_PATH : event.request;

      await cache.put(cacheKey, response.clone());
    }

    return response;
  } catch {
    if (isPosNavigation(event, requestUrl)) {
      return offlinePosResponse();
    }

    const cached = await cachedResponse(event.request);

    if (cached) {
      return cached;
    }

    return new Response("Offline", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (!shouldHandle(requestUrl)) {
    return;
  }

  event.respondWith(handleRequest(event, requestUrl));
});
