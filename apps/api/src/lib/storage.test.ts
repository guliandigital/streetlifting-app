import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageKeyError, createFsStorage, storageKey } from './storage.js';

describe('storageKey', () => {
  it('joins segments into a relative POSIX key', () => {
    expect(storageKey('athletes', 'abc', 'file.png')).toBe('athletes/abc/file.png');
  });

  it.each(['../etc/passwd', '/absolute', 'a/../b', 'a\\b', '', '.hidden', 'a//b'])(
    'rejects %j',
    (key) => {
      expect(() => storageKey(key)).toThrow(StorageKeyError);
    },
  );
});

describe('fs storage driver', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'streetlifting-storage-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('round-trips put/get/delete under the root', async () => {
    const driver = createFsStorage(root);
    const key = storageKey('athletes', 'id-1', 'photo.png');
    await driver.put(key, Buffer.from('png-bytes'), 'image/png');
    expect((await driver.get(key))?.toString()).toBe('png-bytes');
    await driver.delete(key);
    expect(await driver.get(key)).toBeNull();
    await expect(driver.delete(key)).resolves.toBeUndefined();
  });

  it('never resolves outside the root even for legacy keys', async () => {
    const driver = createFsStorage(root);
    await expect(driver.get('../outside.txt')).rejects.toThrow(StorageKeyError);
    await expect(driver.put('..\\outside.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      StorageKeyError,
    );
  });
});
