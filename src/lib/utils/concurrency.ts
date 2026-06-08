/**
 * Run an async mapper over a list with a bounded number of tasks in flight.
 *
 * Used to read a multi-page quote: one vision call per page, but only a few
 * at a time so we don't slam the API (or trip per-minute rate limits) when a
 * user uploads a big cart. Results are returned in INPUT order regardless of
 * which task finishes first.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
