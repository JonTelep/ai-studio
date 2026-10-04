import { z } from 'zod';
import { ASPECTS, CAMERAS, CAPTION_STYLES } from '../model/types.js';

const enumValues = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

const GeneratedFrameSchema = z
  .object({
    prompt: z.string().trim().min(1, 'Frame prompt is empty'),
  })
  .strict();

/** A user file, or a still to generate from a prompt. */
export const FrameSourceSchema = z.union([
  z.string().trim().min(1, 'Frame path is empty'),
  GeneratedFrameSchema,
]);

export type FrameSource = z.infer<typeof FrameSourceSchema>;

export function framePrompt(frame: FrameSource | undefined): string | undefined {
  if (frame && typeof frame === 'object') return frame.prompt;
  return undefined;
}

export function framePath(frame: FrameSource | undefined): string | undefined {
  return typeof frame === 'string' ? frame : undefined;
}

export const ShotSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9_-]{0,40}$/i, 'Use a short id like "horizon" (letters, numbers, dash)'),
    prompt: z.string().trim().min(1, 'Prompt is empty').optional(),
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
    image: z.string().trim().min(1).optional(),
    video: z.string().trim().min(1).optional(),
    start_image: FrameSourceSchema.optional(),
    end_image: FrameSourceSchema.optional(),
    start_from: z.enum(['previous']).optional(),
    reference_images: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .superRefine((shot, ctx) => {
    if (shot.image && shot.video) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Set image or video, not both. image supplies a still. video supplies a clip.',
        path: ['video'],
      });
    }
    if (shot.image && shot.start_image) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Set image or start_image, not both.',
        path: ['start_image'],
      });
    }
    if (shot.start_from && shot.start_image) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'start_from already sets the start frame. Remove start_image.',
        path: ['start_image'],
      });
    }
    if (shot.start_from && shot.image) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'start_from already sets the start frame. Remove image.',
        path: ['image'],
      });
    }
    if (shot.video && (shot.start_image || shot.end_image || shot.start_from)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A supplied video is used as-is. Remove start_image, end_image, and start_from.',
        path: ['video'],
      });
    }
    const hasStart = Boolean(shot.image || shot.start_image || shot.start_from);
    if (shot.end_image && !hasStart) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'end_image needs a start frame. Set image, start_image, or start_from: previous.',
        path: ['end_image'],
      });
    }
    const generatesMotion =
      !shot.video && (shot.kind === 'video' || Boolean(shot.end_image) || shot.start_from === 'previous');
    if (generatesMotion && !shot.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Prompt is required to describe the motion between frames.',
        path: ['prompt'],
      });
    }
    const suppliedStill = Boolean(shot.image || typeof shot.start_image === 'string');
    const generatedFrame = Boolean(shot.start_image && typeof shot.start_image === 'object');
    if (!shot.video && !suppliedStill && !generatedFrame && !generatesMotion && !shot.prompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Prompt is required unless image, video, or start_image supplies the shot.',
        path: ['prompt'],
      });
    }
  })
  .transform((shot) =>
    shot.video || shot.end_image || shot.start_from === 'previous' ? { ...shot, kind: 'video' as const } : shot,
  );

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
        endImageField: z.string().trim().min(1).default('end_image_url'),
        referenceImageField: z.string().trim().min(1).default('reference_image_urls'),
      })
      .strict()
      .default({}),
    assets: z.string().trim().min(1).optional(),
    references: z
      .object({
        style: z.string().trim().min(1).optional(),
        character: z.string().trim().min(1).optional(),
        images: z.array(z.string().trim().min(1)).default([]),
      })
      .strict()
      .optional(),
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
    if (index === 0 && shot.start_from === 'previous') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'start_from: previous needs an earlier shot.',
        path: ['shots', index, 'start_from'],
      });
    }
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
