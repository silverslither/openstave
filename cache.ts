import * as fs from "node:fs";
import * as util from "node:util";
import * as zlib from "node:zlib";

import { MAX_CACHE_SIZE_BYTES } from "./env.ts";

const zlib_promises_gunzip = util.promisify(zlib.gunzip);

interface CacheEntry {
    index: number;
    qSize: number;
    lastUsed: number;
    data: unknown;
}

const cache = new Map<string, CacheEntry>();
const keys: string[] = [];
let cacheSize = 0;

const concurrent = new Map<string, Promise<unknown>>();

export const gzipFileCache = {
    async read(path: string): Promise<unknown> {
        const cached = cache.get(path);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached.data;
        }

        if (concurrent.has(path))
            return concurrent.get(path);

        const promise = gzipFileCache.rawRead(path, () => concurrent.get(path) === promise);
        concurrent.set(path, promise);

        try {
            return await promise;
        } finally {
            if (concurrent.get(path) === promise)
                concurrent.delete(path);
        }
    },
    async rawRead(path: string, valid: () => boolean): Promise<unknown> {
        const compressed = await fs.promises.readFile(path);
        const decompressed = await zlib_promises_gunzip(compressed);

        const size = decompressed.length;
        const json = JSON.parse(decompressed.toString("utf8"));

        if (size > MAX_CACHE_SIZE_BYTES || !valid()) {
            return json;
        }

        while (cacheSize + size > MAX_CACHE_SIZE_BYTES) {
            const i = Math.floor(Math.random() * keys.length);
            const j = Math.floor(Math.random() * keys.length);
            gzipFileCache.evict(cache.get(keys[i])!.lastUsed <= cache.get(keys[j])!.lastUsed ? keys[i] : keys[j]);
        }

        const entry: CacheEntry = {
            index: keys.length,
            qSize: size,
            lastUsed: Date.now(),
            data: json,
        };

        cache.set(path, entry);
        keys.push(path);
        cacheSize += size;

        return json;
    },
    evict(path: string) {
        concurrent.delete(path);

        const evicted = cache.get(path);
        if (evicted == null)
            return;

        const last = keys.pop()!;
        if (last !== path) {
            keys[evicted.index] = last;
            cache.get(last)!.index = evicted.index;
        }
        cache.delete(path);
        cacheSize -= evicted.qSize;
    },
};
