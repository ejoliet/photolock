import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installNetguard,
  markBootComplete,
  onRequest,
  getRequestsAfterBoot,
  NetguardError,
  _resetForTests,
  type NetEvent,
} from "../src/privacy/netguard";

describe("netguard", () => {
  afterEach(() => {
    _resetForTests();
  });

  it("allows a boot-phase fetch, then blocks and counts a post-boot fetch", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response("ok")));
    (globalThis as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    installNetguard({ bootAllowlist: [/\.wasm$/] });

    const events: NetEvent[] = [];
    onRequest((e) => events.push(e));

    // Boot-phase request that matches the allowlist should be allowed.
    await globalThis.fetch("https://example.test/codec.wasm");

    markBootComplete();

    await expect(globalThis.fetch("https://example.test/leak")).rejects.toBeInstanceOf(
      NetguardError,
    );

    expect(getRequestsAfterBoot()).toBe(1);

    const afterBootEvent = events.find((e) => e.phase === "after-boot");
    expect(afterBootEvent).toEqual({
      url: "https://example.test/leak",
      phase: "after-boot",
      blocked: true,
      via: "fetch",
    });
  });

  it("blocks sendBeacon after boot", () => {
    const beaconMock = vi.fn(() => true);
    (navigator as unknown as { sendBeacon: typeof navigator.sendBeacon }).sendBeacon =
      beaconMock as unknown as typeof navigator.sendBeacon;

    installNetguard({ bootAllowlist: [] });
    markBootComplete();

    expect(() => navigator.sendBeacon("https://example.test/beacon")).toThrow(NetguardError);
    expect(beaconMock).not.toHaveBeenCalled();
    expect(getRequestsAfterBoot()).toBe(1);
  });
});
