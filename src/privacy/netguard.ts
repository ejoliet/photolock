// AIDEV-NOTE: Netguard proves the "zero requests after boot" claim. It wraps every
// network entry point (fetch, XHR, sendBeacon, WebSocket) plus PerformanceObserver
// as a backstop for anything the wrappers miss (e.g. <img src> set directly).

export type NetVia = "fetch" | "xhr" | "beacon" | "ws" | "resource";

export interface NetEvent {
  url: string;
  phase: "boot" | "after-boot";
  blocked: boolean;
  via: NetVia;
}

export class NetguardError extends Error {
  constructor(url: string, via: NetVia) {
    super(`NetguardError: request blocked after boot [${via}] ${url}`);
    this.name = "NetguardError";
  }
}

let installed = false;
let bootComplete = false;
let bootAllowlist: RegExp[] = [];
let events: NetEvent[] = [];
const callbacks: Array<(e: NetEvent) => void> = [];

let originalFetch: typeof globalThis.fetch | undefined;
let originalXhrOpen: typeof XMLHttpRequest.prototype.open | undefined;
let originalSendBeacon: typeof navigator.sendBeacon | undefined;
let originalWebSocket: typeof WebSocket | undefined;
let perfObserver: PerformanceObserver | undefined;

function isAllowed(url: string): boolean {
  if (bootAllowlist.length === 0) return true;
  return bootAllowlist.some((re) => re.test(url));
}

function record(url: string, via: NetVia, blocked: boolean): void {
  const phase: NetEvent["phase"] = bootComplete ? "after-boot" : "boot";
  const event: NetEvent = { url, phase, blocked, via };
  events.push(event);
  if (blocked) {
    console.error(`Netguard blocked request after boot: ${url}`);
  }
  for (const cb of callbacks) cb(event);
}

function guardOrThrow(url: string, via: NetVia): void {
  if (bootComplete) {
    record(url, via, true);
    throw new NetguardError(url, via);
  }
  if (!isAllowed(url)) {
    // AIDEV-NOTE: boot-phase requests must still match the allowlist; anything else
    // is treated the same as a post-boot violation so mistakes surface immediately.
    record(url, via, true);
    throw new NetguardError(url, via);
  }
  record(url, via, false);
}

export function installNetguard(opts: { bootAllowlist: RegExp[] }): void {
  bootAllowlist = opts.bootAllowlist;
  if (installed) return;
  installed = true;
  bootComplete = false;
  events = [];

  // AIDEV-NOTE: guard for Node/vitest where fetch may be undefined; define a stub so
  // the wrapper always has something to wrap and tests can exercise it.
  if (typeof globalThis.fetch === "undefined") {
    (globalThis as { fetch?: typeof fetch }).fetch = (() =>
      Promise.reject(new Error("no fetch in this environment"))) as typeof fetch;
  }
  originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    try {
      guardOrThrow(url, "fetch");
    } catch (err) {
      // AIDEV-NOTE: fetch is a promise-returning API; reject instead of throwing
      // synchronously so callers using `await fetch(...)` see a rejected promise.
      return Promise.reject(err);
    }
    return originalFetch!(input, init);
  }) as typeof fetch;

  if (typeof XMLHttpRequest !== "undefined") {
    originalXhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      const urlStr = typeof url === "string" ? url : url.href;
      guardOrThrow(urlStr, "xhr");
      // @ts-expect-error - forwarding variadic overload args to the native implementation
      return originalXhrOpen!.call(this, method, url, ...rest);
    };
  }

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    originalSendBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit) => {
      const urlStr = typeof url === "string" ? url : url.href;
      guardOrThrow(urlStr, "beacon");
      return originalSendBeacon!(url, data);
    }) as typeof navigator.sendBeacon;
  }

  if (typeof WebSocket !== "undefined") {
    originalWebSocket = WebSocket;
    const WrappedWebSocket = function (
      this: WebSocket,
      url: string | URL,
      protocols?: string | string[],
    ) {
      const urlStr = typeof url === "string" ? url : url.href;
      guardOrThrow(urlStr, "ws");
      return new originalWebSocket!(url, protocols);
    } as unknown as typeof WebSocket;
    WrappedWebSocket.prototype = originalWebSocket.prototype;
    (globalThis as { WebSocket?: typeof WebSocket }).WebSocket = WrappedWebSocket;
  }

  if (typeof PerformanceObserver !== "undefined") {
    try {
      perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (bootComplete) {
            record(entry.name, "resource", true);
          }
        }
      });
      perfObserver.observe({ type: "resource", buffered: true });
    } catch {
      // AIDEV-NOTE: some environments (jsdom) don't support the 'resource' entry type
    }
  }
}

export function markBootComplete(): void {
  bootComplete = true;
}

export function onRequest(cb: (e: NetEvent) => void): void {
  callbacks.push(cb);
}

export function getRequestsAfterBoot(): number {
  return events.filter((e) => e.phase === "after-boot" && e.blocked).length;
}

export function getEvents(): NetEvent[] {
  return events.slice();
}

export function _resetForTests(): void {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (originalXhrOpen && typeof XMLHttpRequest !== "undefined") {
    XMLHttpRequest.prototype.open = originalXhrOpen;
  }
  if (originalSendBeacon && typeof navigator !== "undefined") {
    navigator.sendBeacon = originalSendBeacon;
  }
  if (originalWebSocket && typeof WebSocket !== "undefined") {
    (globalThis as { WebSocket?: typeof WebSocket }).WebSocket = originalWebSocket;
  }
  if (perfObserver) {
    try {
      perfObserver.disconnect();
    } catch {
      // ignore
    }
  }
  installed = false;
  bootComplete = false;
  bootAllowlist = [];
  events = [];
  callbacks.length = 0;
  originalFetch = undefined;
  originalXhrOpen = undefined;
  originalSendBeacon = undefined;
  originalWebSocket = undefined;
  perfObserver = undefined;
}
