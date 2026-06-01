import { getHost } from "../../../lib/host";
import type { HelmsmanEvent } from "@helmsman/shared";

export const dynamic = "force-dynamic";

/** Server-Sent Events stream of all Helmsman run/step events for the live Mission Control view. */
export async function GET(): Promise<Response> {
  const host = getHost();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: HelmsmanEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      const unsubscribe = host.bus.subscribe(send);
      controller.enqueue(encoder.encode(`: connected\n\n`));

      const keepAlive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15_000);

      // Tear down when the client disconnects.
      const close = () => {
        clearInterval(keepAlive);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      (controller as unknown as { _close?: () => void })._close = close;
    },
    cancel() {
      /* handled via stored close in start() if needed */
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
