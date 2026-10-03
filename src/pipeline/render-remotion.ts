import { rmSync } from 'node:fs';
import path from 'node:path';
import type { RenderPlan } from '../model/plan.js';
import { packageRoot } from '../util/root.js';

export async function renderWithRemotion(plan: RenderPlan, workDir: string, publicDir: string): Promise<string> {
  const { bundle } = await import('@remotion/bundler');
  const { renderMedia, selectComposition } = await import('@remotion/renderer');
  const bundleDir = path.join(workDir, 'remotion-bundle');
  rmSync(bundleDir, { recursive: true, force: true });
  const serveUrl = await bundle({
    entryPoint: path.join(packageRoot(), 'src', 'composition', 'index.tsx'),
    publicDir,
    outDir: bundleDir,
    webpackOverride: (config) => {
      config.resolve ??= {};
      config.resolve.extensionAlias = {
        ...config.resolve.extensionAlias,
        '.js': ['.tsx', '.ts', '.js'],
      };
      return config;
    },
  });
  const inputProps = { plan };
  const chromiumOptions = {
    gl: 'swangle' as const,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  };
  const composition = await selectComposition({
    serveUrl,
    id: 'Studio',
    inputProps,
    chromiumOptions,
  });
  const output = path.join(workDir, 'output.mp4');
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    outputLocation: output,
    inputProps,
    chromiumOptions,
    concurrency: 2,
    overwrite: true,
    imageFormat: 'jpeg',
  });
  return output;
}
