/** Skim's /read/batch endpoints accept at most this many URLs per request. */
export const READ_BATCH_SIZE = 10;
/** How many of those batch requests may be in flight at once. */
export const READ_BATCH_CONCURRENCY = 3;
/** Upper bound for one read_urls call (five batches of ten). */
export const READ_URLS_MAX = 50;
export function chunkList(items, size) {
    if (size < 1)
        throw new Error("chunk size must be at least 1");
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}
function batchFailureText(err) {
    return err instanceof Error ? err.message : String(err);
}
/**
 * Keep one result per requested URL. A same-length payload is already in
 * request order (including duplicate URLs). A short payload is padded so
 * later chunks still line up.
 */
function alignChunk(urls, results) {
    if (results.length === urls.length)
        return results.slice();
    return urls.map((url, index) => {
        const item = results[index];
        if (item)
            return item.url ? item : { ...item, url };
        return {
            url,
            ok: false,
            error: { message: "batch response missing this URL" },
        };
    });
}
/**
 * Split a URL list into batches of `batchSize` (default 10) and run up to
 * `concurrency` batches at once (default 3). Results are concatenated in
 * input order.
 *
 * A chunk whose request throws becomes a per-URL error when at least one
 * other chunk succeeded. If every chunk fails, the first chunk's error is
 * rethrown so a single batch keeps the caller's existing failure path.
 */
export async function readUrlsInBatches(urls, postBatch, options) {
    const batchSize = options?.batchSize ?? READ_BATCH_SIZE;
    const concurrency = options?.concurrency ?? READ_BATCH_CONCURRENCY;
    const chunks = chunkList(urls, batchSize);
    if (chunks.length === 0)
        return [];
    const outcomes = new Array(chunks.length);
    let cursor = 0;
    const workers = Math.max(1, Math.min(concurrency, chunks.length));
    async function worker() {
        for (;;) {
            const index = cursor++;
            if (index >= chunks.length)
                return;
            const chunk = chunks[index];
            try {
                const results = await postBatch(chunk);
                outcomes[index] = { ok: true, items: alignChunk(chunk, results ?? []) };
            }
            catch (error) {
                outcomes[index] = { ok: false, urls: chunk, error };
            }
        }
    }
    await Promise.all(Array.from({ length: workers }, () => worker()));
    const failed = outcomes.filter((outcome) => outcome != null && !outcome.ok);
    if (failed.length === outcomes.length) {
        const error = failed[0].error;
        throw error instanceof Error ? error : new Error(batchFailureText(error));
    }
    return outcomes.flatMap((outcome) => {
        if (outcome == null) {
            throw new Error("batch worker did not record an outcome");
        }
        if (outcome.ok)
            return outcome.items;
        const message = batchFailureText(outcome.error);
        return outcome.urls.map((url) => ({
            url,
            ok: false,
            error: { message },
        }));
    });
}
export function formatBatchMarkdown(items, formatPage, redact = (text) => text) {
    return items
        .map((item) => {
        if (item.ok && item.data) {
            return `## ${item.url}\n\n${formatPage(item.data)}`;
        }
        const err = item.error;
        const detail = err
            ? `${err.status ?? ""} ${err.message ?? ""}`.trim()
            : "unknown error";
        return `## ${item.url}\n\nERROR: ${redact(detail || "unknown error")}`;
    })
        .join("\n\n---\n\n");
}
