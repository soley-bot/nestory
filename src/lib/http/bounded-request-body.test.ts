import { describe, expect, it } from "vitest";
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";

describe("readBoundedRequestBody", () => {
  it("rejects an oversized declared length before consuming the stream", async () => {
    const request = streamRequest(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("small"));
          controller.close();
        },
      }),
      { "content-length": "5000" },
    );

    await expect(readBoundedRequestBody(request, 1024)).resolves.toEqual({
      ok: false,
      status: 413,
    });
    expect(request.bodyUsed).toBe(false);
  });

  it("aborts a missing-length stream as soon as it crosses the byte budget", async () => {
    const request = streamRequest(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(700));
          controller.enqueue(new Uint8Array(400));
          controller.close();
        },
      }),
    );

    await expect(readBoundedRequestBody(request, 1024)).resolves.toEqual({
      ok: false,
      status: 413,
    });
  });

  it("returns a bounded UTF-8 body when Content-Length is absent", async () => {
    const request = new Request("http://localhost/test", {
      body: "token_hash=valid&type=recovery",
      method: "POST",
    });
    expect(request.headers.get("content-length")).toBeNull();

    await expect(readBoundedRequestBody(request, 1024)).resolves.toEqual({
      ok: true,
      text: "token_hash=valid&type=recovery",
    });
  });
});

function streamRequest(
  body: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  return new Request("http://localhost/test", {
    body,
    headers,
    method: "POST",
    // Node's Request requires duplex for a streaming request body.
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}
