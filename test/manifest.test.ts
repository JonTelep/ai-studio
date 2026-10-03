import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addTake,
  emptyManifest,
  loadManifest,
  nextTakeId,
  reusableTake,
  saveManifest,
  selectTake,
  shotEntry,
  type Take,
} from '../src/pipeline/manifest.js';

function take(partial: Partial<Take> & Pick<Take, 'id' | 'kind' | 'path'>): Take {
  return {
    inputHash: 'hash',
    provider: 'placeholder',
    model: 'placeholder',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'done',
    ...partial,
  };
}

describe('manifest', () => {
  it('round-trips and reuses a finished take only when the file is still there', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'studio-manifest-'));
    const manifest = emptyManifest('demo');
    const entry = shotEntry(manifest, 'horizon');
    const relative = 'shots/horizon/image-1.png';
    const file = path.join(dir, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, 'png');
    addTake(entry, take({ id: 'image-1', kind: 'image', path: relative, inputHash: 'aaa' }));
    saveManifest(dir, manifest);

    const loaded = loadManifest(dir, 'demo');
    expect(loaded.shots.horizon.selected.image).toBe('image-1');
    expect(reusableTake(loaded.shots.horizon.takes, 'image-1', 'image', 'aaa', dir)?.id).toBe('image-1');
    expect(reusableTake(loaded.shots.horizon.takes, 'image-1', 'image', 'bbb', dir)).toBeUndefined();
    expect(reusableTake(loaded.shots.horizon.takes, 'image-1', 'video', 'aaa', dir)).toBeUndefined();
    expect(
      reusableTake(loaded.shots.horizon.takes, 'image-1', 'image', 'aaa', path.join(dir, 'missing')),
    ).toBeUndefined();
  });

  it('numbers takes and selects one', () => {
    const manifest = emptyManifest('demo');
    const entry = shotEntry(manifest, 'horizon');
    expect(nextTakeId(entry.takes, 'image')).toBe('image-1');
    addTake(entry, take({ id: 'image-1', kind: 'image', path: 'a.png' }));
    addTake(entry, take({ id: 'image-2', kind: 'image', path: 'b.png', inputHash: 'other' }));
    expect(nextTakeId(entry.takes, 'image')).toBe('image-3');
    expect(entry.selected.image).toBe('image-2');
    const selected = selectTake(manifest, 'horizon', 'image-1');
    expect(selected.shots.horizon.selected.image).toBe('image-1');
    expect(() => selectTake(manifest, 'horizon', 'missing')).toThrow(/not found/);
    expect(() => selectTake(manifest, 'nope', 'image-1')).toThrow(/not in the manifest/);
  });
});
