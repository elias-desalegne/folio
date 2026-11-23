import { useEffect, useState } from 'react';
import { api } from '../api';
import type { IconRequest } from '../types';

const UNIQUE_EXTS = new Set([
  'exe',
  'lnk',
  'ico',
  'cur',
  'ani',
  'msi',
  'msix',
  'appx',
  'scr',
  'url',
  'cpl',
  'msc',
]);

// Cache keyed by either `file:<lowerPath>` or `ext:.<ext>`
const iconStore = new Map<string, string>();
const inFlightKeys = new Set<string>();
const pendingReqs = new Map<string, IconRequest>();
const listeners = new Map<string, Set<() => void>>();

let flushTimer: number | null = null;

function getKey(path: string, extension: string, isDir: boolean): string | null {
  if (!path) return null;
  if (isDir) {
    // Only fetch custom icons for folders; standard folders use crisp Fluent SVG
    return null;
  }
  const ext = (extension || '').toLowerCase();
  if (UNIQUE_EXTS.has(ext)) {
    return `file:${path.toLowerCase()}`;
  }
  if (ext) {
    return `ext:.${ext}`;
  }
  return 'ext:.__file__';
}

function notifyKey(key: string) {
  const subs = listeners.get(key);
  if (subs) {
    for (const cb of subs) cb();
  }
}

function scheduleFlush() {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(async () => {
    flushTimer = null;
    if (pendingReqs.size === 0) return;

    const batchEntries = Array.from(pendingReqs.entries());
    pendingReqs.clear();

    const requests: IconRequest[] = [];
    const pathToKey = new Map<string, string>();

    for (const [key, req] of batchEntries) {
      if (iconStore.has(key) || inFlightKeys.has(key)) continue;
      inFlightKeys.add(key);
      requests.push(req);
      pathToKey.set(req.path, key);
    }

    if (requests.length === 0) return;

    try {
      const result = await api.getFileIcons(requests);
      for (const req of requests) {
        const key = pathToKey.get(req.path)!;
        inFlightKeys.delete(key);
        const url = result[req.path] || '';
        iconStore.set(key, url);
        notifyKey(key);
      }
    } catch {
      for (const req of requests) {
        const key = pathToKey.get(req.path)!;
        inFlightKeys.delete(key);
      }
    }
  }, 12);
}

/**
 * React hook returning the native Windows shell icon PNG data URL for a file,
 * automatically micro-batched and cached across the entire app.
 */
export function useNativeIcon(
  path: string | undefined,
  extension: string | undefined,
  isDir: boolean | undefined
): string | null {
  const key = path ? getKey(path, extension || '', Boolean(isDir)) : null;
  const cached = key ? iconStore.get(key) : undefined;
  const [url, setUrl] = useState<string | null>(cached || null);

  useEffect(() => {
    if (!key || !path) {
      setUrl(null);
      return;
    }

    const existing = iconStore.get(key);
    if (existing !== undefined) {
      setUrl(existing || null);
      return;
    }

    setUrl(null);
    const onUpdate = () => {
      const next = iconStore.get(key);
      if (next !== undefined) {
        setUrl(next || null);
      }
    };

    let subs = listeners.get(key);
    if (!subs) {
      subs = new Set();
      listeners.set(key, subs);
    }
    subs.add(onUpdate);

    if (!inFlightKeys.has(key) && !pendingReqs.has(key)) {
      pendingReqs.set(key, {
        path,
        extension: (extension || '').toLowerCase(),
        isDir: Boolean(isDir),
      });
      scheduleFlush();
    }

    return () => {
      const s = listeners.get(key);
      if (s) {
        s.delete(onUpdate);
        if (s.size === 0) listeners.delete(key);
      }
    };
  }, [key, path, extension, isDir]);

  return url;
}
