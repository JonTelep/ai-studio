import { z } from 'zod';
import { ASPECTS, CAMERAS, CAPTION_STYLES } from '../model/types.js';

const enumValues = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const ShotSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{0,40}$/i, 'Use a short id like "horizon" (letters, numbers, dash)'),
    prompt: z.string().trim().min(1, 'Prompt is required'),
    duration: z
      .number({ invalid_type_error: 'Duration must be a number of seconds' })
      .positive('Duration must be greater than 0')
      .max(120, 'Duration must be 120 seconds or less'),
    kind: z.enum(['image', 'video']).default('image'),
    camera: enumValues(CAMERAS).default('ken-burns-in'),
    text: z
      .string()
      .optional()
      .transform((value) => {
        const trimmed = value?.trim();
        return trimmed ? trimmed : undefined;
      }),
    videoMode: z.enum(['image-to-video', 'text-to-video']).optional(),
  })
  .strict();

export const ProjectObjectSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required'),
    aspect: enumValues(ASPECTS),
    fps: z
      .number({ invalid_type_error: 'fps must be a number' })
      .int('fps must be a whole number')
      .min(1)
      .max(60)
      .default(30),
    provider: z.enum(['placeholder', 'fal', 'auto']).default('auto'),
    models: z
      .object({
        image: z.string().trim().min(1).default('fal-ai/flux/dev'),
        video: z.string().trim().min(1).default('bytedance/seedance-2.0/image-to-video'),
        voice: z.string().trim().min(1).default('eleven_multilingual_v2'),
        videoImageField: z.string().trim().min(1).optional(),
      })
      .strict()
      .default({}),
    shots: z.array(ShotSchema).min(1, 'Add at least one shot'),
    voiceover: z
      .object({
        script: z.string().trim().min(1, 'Voiceover script is empty'),
        provider: z.enum(['placeholder', 'elevenlabs', 'auto']).default('auto'),
        voiceId: z.string().trim().min(1).default('21m00Tcm4TlvDq8ikWAM'),
        model: z.string().trim().min(1).optional(),
      })
      .strict()
      .optional(),
    music: z
      .object({
        file: z.string().trim().min(1, 'Music file path is required'),
        volume: z.number().min(0).max(1).default(0.25),
      })
      .strict()
      .optional(),
    sfx: z
      .array(
        z
          .object({
            file: z.string().trim().min(1, 'SFX file path is required'),
            at: z.number().nonnegative('SFX time must be zero or greater').default(0),
            volume: z.number().min(0).max(1).default(0.8),
          })
          .strict(),
      )
      .default([]),
    captions: z
      .object({
        style: enumValues(CAPTION_STYLES).default('clean'),
      })
      .strict()
      .default({}),
    edit: z
      .object({
        snapCutsToBeats: z.boolean().default(false),
        snapWindowSec: z.number().positive('snapWindowSec must be greater than 0').default(0.25),
      })
      .strict()
      .default({}),
  })
  .strict();

export const ProjectSchema = ProjectObjectSchema.superRefine((project, ctx) => {
  const seen = new Set<string>();
  project.shots.forEach((shot, index) => {
    const key = shot.id.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate shot id "${shot.id}"`,
        path: ['shots', index, 'id'],
      });
    }
    seen.add(key);
  });
});

export type Shot = z.infer<typeof ShotSchema>;
export type Project = z.infer<typeof ProjectSchema>;

export class ProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectError';
  }
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.message}`;
    })
    .join('\n');
}
