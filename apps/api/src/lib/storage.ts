import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { del, get, put } from '@vercel/blob';
import { moduleLogger } from './logger.js';

const log = moduleLogger('storage');

/**
 * Upload limits. Vercel Functions reject request bodies over 4.5 MB, and
 * uploads arrive as base64 JSON (~1.37× the file), so file content is capped
 * at 3 MiB and the route body limit is set to the platform maximum.
 */
export const UPLOAD_BODY_LIMIT_BYTES = 4_500_000;
export const MAX_UPLOAD_CONTENT_BYTES = 3 * 1024 * 1024;

/**
 * Object storage for uploaded files (athlete photos, federation and passport
 * attachments). Keys are relative POSIX paths such as
 * `athletes/<id>/<uuid>-<name>` and are persisted as `Attachment.storagePath`.
 *
 * Drivers:
 *   - `fs`          — local directory under `STORAGE_DIR` (default `./storage`);
 *                     development, tests and self-hosted deployments.
 *   - `vercel-blob` — private Vercel Blob store; every read goes through the
 *                     API so authorization stays in the route handlers.
 *
 * `STORAGE_DRIVER` picks explicitly; otherwise `vercel-blob` is used when a
 * `BLOB_READ_WRITE_TOKEN` is present, else `fs`.
 */
export interface StorageDriver {
  readonly name: 'fs' | 'vercel-blob';
  put(key: string, content: Buffer, contentType: string): Promise<void>;
  /** `null` when the object does not exist. */
  get(key: string): Promise<Buffer | null>;
  /** Idempotent — deleting a missing object is not an error. */
  delete(key: string): Promise<void>;
}

export class StorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key}`);
    this.name = 'StorageKeyError';
  }
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._ ()@,+-]*$/u;

/**
 * Build a storage key from path segments. Each segment is validated on its
 * own (no separators, no `.`/`..`) so nothing is silently normalized away.
 */
export function storageKey(...segments: string[]): string {
  if (segments.length === 0) throw new StorageKeyError('');
  for (const segment of segments) {
    if (segment === '.' || segment === '..' || !SEGMENT.test(segment)) {
      throw new StorageKeyError(segments.join('/'));
    }
  }
  const key = segments.join('/');
  assertStorageKey(key);
  return key;
}

export function assertStorageKey(key: string): void {
  if (!key || key.length > 512 || key.startsWith('/') || key.includes('\\')) {
    throw new StorageKeyError(key);
  }
  for (const segment of key.split('/')) {
    if (segment === '.' || segment === '..' || !SEGMENT.test(segment)) {
      throw new StorageKeyError(key);
    }
  }
}

export function createFsStorage(
  root = process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage'),
): StorageDriver {
  const absoluteRoot = path.resolve(root);
  const resolve = (key: string): string => {
    // Legacy rows may hold Windows separators from development machines.
    const normalized = key.replace(/\\/g, '/');
    assertStorageKey(normalized);
    const absolute = path.resolve(absoluteRoot, normalized);
    if (!absolute.startsWith(`${absoluteRoot}${path.sep}`)) throw new StorageKeyError(key);
    return absolute;
  };
  return {
    name: 'fs',
    async put(key, content) {
      const absolute = resolve(key);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, content);
    },
    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}

export function createVercelBlobStorage(): StorageDriver {
  return {
    name: 'vercel-blob',
    async put(key, content, contentType) {
      assertStorageKey(key);
      await put(key, content, {
        access: 'private',
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    },
    async get(key) {
      assertStorageKey(key);
      const result = await get(key, { access: 'private' });
      if (!result || result.statusCode !== 200) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },
    async delete(key) {
      assertStorageKey(key);
      await del(key);
    },
  };
}

let active: StorageDriver | null = null;

function selectDriver(): StorageDriver {
  const explicit = process.env.STORAGE_DRIVER?.trim();
  const driver =
    explicit === 'fs' || explicit === 'vercel-blob'
      ? explicit
      : process.env.BLOB_READ_WRITE_TOKEN
        ? 'vercel-blob'
        : 'fs';
  const created = driver === 'vercel-blob' ? createVercelBlobStorage() : createFsStorage();
  log.info({ driver: created.name }, 'file storage driver selected');
  return created;
}

/** Process-wide driver, chosen lazily on first use so env is fully loaded. */
export const storage: StorageDriver = {
  get name() {
    return (active ??= selectDriver()).name;
  },
  put: (key, content, contentType) => (active ??= selectDriver()).put(key, content, contentType),
  get: (key) => (active ??= selectDriver()).get(key),
  delete: (key) => (active ??= selectDriver()).delete(key),
};

/** Test hook: drop the cached driver so a new env takes effect. */
export function resetStorageDriverForTests(): void {
  active = null;
}
