import { describe, expect, it } from "bun:test";
import { releaseWhenBodyConsumed } from "../src/core/response-lifecycle";

describe("managed-key response body lifecycle", () => {
  it("releases the concurrency slot and settles quota after normal body completion", async () => {
    let releaseCalls = 0;
    let settlementCalls = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("response body"));
        controller.close();
      },
    });

    const response = releaseWhenBodyConsumed(
      new Response(source),
      () => { releaseCalls += 1; },
      () => { settlementCalls += 1; },
    );

    expect(await response.text()).toBe("response body");
    expect(releaseCalls).toBe(1);
    expect(settlementCalls).toBe(1);
  });

  it("releases the concurrency slot when the downstream client cancels the body", async () => {
    let releaseCalls = 0;
    let settlementCalls = 0;
    let cancelledWith: unknown;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode("partial response"));
      },
      cancel(reason) {
        cancelledWith = reason;
      },
    });

    const response = releaseWhenBodyConsumed(
      new Response(source),
      () => { releaseCalls += 1; },
      () => { settlementCalls += 1; },
    );
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe("partial response");

    await reader.cancel("client disconnected");
    expect(cancelledWith).toBe("client disconnected");
    expect(releaseCalls).toBe(1);
    expect(settlementCalls).toBe(1);
  });

  it("releases the concurrency slot and settles quota after an upstream body read error", async () => {
    let releaseCalls = 0;
    let settlementCalls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("upstream body failed"));
      },
    });

    const response = releaseWhenBodyConsumed(
      new Response(source),
      () => { releaseCalls += 1; },
      () => { settlementCalls += 1; },
    );

    let readError: unknown;
    try {
      await response.text();
    } catch (error) {
      readError = error;
    }

    expect(readError).toBeInstanceOf(Error);
    expect((readError as Error).message).toBe("upstream body failed");
    expect(releaseCalls).toBe(1);
    expect(settlementCalls).toBe(1);
  });

  it("runs lifecycle callbacks once when the upstream response has no body", () => {
    let releaseCalls = 0;
    let settlementCalls = 0;
    const original = new Response(null, { status: 204 });

    const response = releaseWhenBodyConsumed(
      original,
      () => { releaseCalls += 1; },
      () => { settlementCalls += 1; },
    );

    expect(response).toBe(original);
    expect(response.status).toBe(204);
    expect(releaseCalls).toBe(1);
    expect(settlementCalls).toBe(1);
  });
});
