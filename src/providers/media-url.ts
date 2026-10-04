const URL_KEYS = new Set(['url', 'video_url', 'image_url', 'audio_url']);

export function extractMediaUrl(data: unknown): string {
  const urls: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (URL_KEYS.has(key) && typeof value === 'string' && /^https?:\/\//.test(value)) {
        urls.push(value);
      } else {
        walk(value);
      }
    }
  };
  walk(data);
  const video = urls.find((url) => /\.(mp4|webm|mov)(\?|$)/i.test(url));
  if (video) return video;
  if (urls[0]) return urls[0];
  throw new Error('Provider response did not include a media URL.');
}

export function videoImageField(model: string, override?: string): string {
  if (override) return override;
  if (model.includes('kling')) return 'start_image_url';
  return 'image_url';
}

/** Default fal input for a last frame. Kling variants that say tail_image_url can override it. */
export function videoEndImageField(override?: string): string {
  return override?.trim() || 'end_image_url';
}

/**
 * Set the end-frame URL. The field must differ from the start-frame field so the
 * start still is not replaced. Call this after reference images are assigned.
 */
export function assignEndImage(
  body: Record<string, unknown>,
  url: string,
  field = 'end_image_url',
  startField?: string,
): void {
  if (startField && field === startField) {
    throw new Error(
      `End image field "${field}" is the same as the start image field. Set models.endImageField to a different input, such as end_image_url or tail_image_url.`,
    );
  }
  body[field] = url;
}

/**
 * Attach reference stills without replacing a start frame that already uses the same key.
 * A single-url field (`image_url`) gets one string. List fields get the whole array.
 */
export function assignReferenceImages(
  body: Record<string, unknown>,
  urls: string[],
  field = 'reference_image_urls',
): void {
  if (urls.length === 0) return;
  const existing = body[field];
  if (typeof existing === 'string') {
    body[field] = [existing, ...urls];
    return;
  }
  const single = field.endsWith('_url') && !field.endsWith('_urls') && urls.length === 1;
  body[field] = single ? urls[0] : urls;
}

export function fluxImageSize(aspect: '9:16' | '1:1' | '16:9', width: number, height: number, model: string) {
  if (model.includes('flux-2') || model.includes('flux/2')) {
    return { width, height };
  }
  if (aspect === '16:9') return 'landscape_16_9';
  if (aspect === '9:16') return 'portrait_16_9';
  return 'square_hd';
}
