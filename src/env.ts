import { existsSync, readFileSync } from 'node:fs';

/** Load KEY=VALUE lines from .env without overriding variables already set. */
export function loadEnvFile(file = '.env'): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!key || !value) continue;
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function paidCallsForbidden(): boolean {
  return process.env.STUDIO_FORBID_PAID === '1';
}

export function assertPaidAllowed(providerName: string): void {
  if (paidCallsForbidden()) {
    throw new Error(
      `Refusing to call paid provider "${providerName}" because STUDIO_FORBID_PAID=1.`,
    );
  }
}
