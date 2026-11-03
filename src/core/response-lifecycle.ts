/**
 * Response body lifecycle helpers used by managed-key concurrency and quota accounting.
 *
 * The callback pair must be invoked exactly once regardless of normal completion,
 * upstream read failure, or downstream cancellation.
 */
export function releaseWhenBodyConsumed(
  response: Response,
  release: () => void,
  afterRelease: () => void = () => {},
): Response {
  const source = response.body;
  if (!source) {
    release();
    afterRelease();
    return response;
  }

  const reader = source.getReader();
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    try {
      release();
    } finally {
      try {
        afterRelease();
      } finally {
        try { reader.releaseLock(); } catch {}
      }
    }
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) {
          controller.close();
          finish();
        } else {
          controller.enqueue(result.value);
        }
      } catch (error) {
        controller.error(error);
        finish();
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
