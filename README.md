# ai-studio

Open-source AI video studio. Describe a shot list, and it orchestrates image, video, voice and sound models, then edits everything into a finished MP4 with code-timed cuts, captions and motion graphics. Bring your own keys.

It is a general studio for short clips. A project can be a super-realistic ocean shot or a caption-driven joke. Length is just the number of shots. The examples are about 7 to 10 seconds. The edit is a Remotion composition: a pure function of time that sequences shots, moves stills, lays word-by-word captions, and mixes audio.

Inspired by agent-made music videos.

## Quick start

Requires Node.js 20 or newer, ffmpeg, and Make.

```bash
git clone https://github.com/JonTelep/ai-studio.git
cd ai-studio
cp .env.example .env
npm install
make dry ocean
```

That validates `projects/ocean/project.yaml`, renders a free placeholder preview to `projects/ocean/output.mp4`, and prints how many paid calls a fal run would make. Nothing is billed. `make dry meme-example` does the same with captions, a voice stand-in, and beat-snapped cuts.

A project lives in its own folder:

```
projects/<name>/project.yaml     shot list
projects/<name>/idea.md          plain-words description
projects/<name>/images/          your photos and clips
projects/<name>/work/            takes (gitignored)
projects/<name>/output.mp4       final render (gitignored)
```

`make` with no target prints the workflow, in order:

```bash
make new starship          # or: make new name=starship
make script starship       # optional: Claude Code drafts project.yaml from idea.md
make dry starship          # validate, preview, print the paid-call count
make images starship       # stills only, then projects/<name>/contact-sheet.jpg
make prod starship         # video, voice, and sound, then output.mp4
```

`make images` and `make prod` ask before any paid call. They do not pass `--yes`. `make prod` refuses to start when a shot that needs a still does not have one yet.

The Makefile renders with ffmpeg so it does not download Chrome. The CLI default is still Remotion:

```bash
npm run studio -- render projects/ocean/project.yaml
make prod ocean renderer=remotion
```

To generate with fal.ai, put `FAL_KEY` in `.env`, set `provider: fal` in the project, run `make dry` to read the call count, then `make images` and `make prod`. Confirm each one in the terminal.

## Commands

The Makefile calls the CLI. You can run the CLI directly:

```bash
npm run studio -- dry projects/ocean/project.yaml
npm run studio -- images projects/ocean/project.yaml
npm run studio -- prod projects/ocean/project.yaml --renderer ffmpeg
npm run studio -- takes projects/ocean/project.yaml
npm run studio -- select projects/ocean/project.yaml horizon image-1
```

| Flag | What it does |
| --- | --- |
| `--yes` | Skip the paid-call confirmation. The Makefile never sets this |
| `--dry-run` | Print the estimate only |
| `--fresh` | Ignore cached takes and make new ones |
| `--provider placeholder\|fal\|auto` | Override the project provider |
| `--renderer remotion\|ffmpeg` | Choose the encoder. CLI default `remotion`. Makefile default `ffmpeg` |
| `--stage image\|video` | Which stage `redo` regenerates |
| `--analyzer energy\|python` | Beat tracker. Default `energy` |
| `--whisper` | Optional local Whisper word timestamps |

Other Make targets: `make redo <name> shot=<id>` (image if that shot has no video yet, otherwise video; `stage=image` or `stage=video` forces it), `make pick <name> shot=<id> take=image-1`, `make render <name>` (no generation), `make open <name>`.

`make script <name>` runs Claude Code headless (`claude -p`) when it is installed. It reads `idea.md`, `images/`, and `CLAUDE.md`, updates `project.yaml`, and validates it. It does not generate video. If `claude` is missing, the target explains how to install it and stops.

Generation writes takes under `projects/<name>/work/` and a `manifest.json`. A later run skips a shot when a finished take has the same prompt, model, provider, and size, and the file is still on disk. `make takes` lists them. `make pick` chooses which image, video, or voice take the render uses. The selected take is marked with `*`.

## Providers

`provider` on the project is `placeholder`, `fal`, or `auto`.

- **placeholder** draws gradient stills with the prompt on them, turns video shots into short moves, and synthesizes a quiet tone plus even word timings. It never opens a network connection.
- **fal** calls fal.ai for stills and video. The default still model is `fal-ai/flux/dev`. The default video model is `bytedance/seedance-2.0/image-to-video`. Kling image-to-video is `fal-ai/kling-video/v3/pro/image-to-video` (it reads `start_image_url` instead of `image_url`). A first-and-last-frame shot also uploads the end still. Seedance and Kling v3 read `end_image_url`. Older Kling variants call that input `tail_image_url`; set `models.endImageField` when the model expects a different name. Set the ids in the project or in `studio.config.yaml`. The catalog changes.
- **auto** uses fal when `FAL_KEY` is set, otherwise the placeholder.

Image-to-video shots generate a still, then animate it. Text-to-video shots skip the still. A shot with `end_image` or `start_from: previous` sends both a start frame and an end frame, and the video model generates the motion between them. The placeholder provider crossfades those two stills, so the bridge is visible with no key. For other placeholder videos, camera motion is baked into the take. For fal videos, describe the motion in the prompt. Ken Burns and pans in the edit apply to stills.

Reference stills are uploaded with each fal image or video call that generates media. They are sent as `reference_image_urls` unless `models.referenceImageField` names another input. The placeholder provider does not invent a likeness from them. It still checks that the files exist. A global style or character is included on every shot, ahead of that shot's own `reference_images`.

Voice is optional. `voiceover.provider` is `placeholder`, `elevenlabs`, or `auto`. Auto uses ElevenLabs when `ELEVENLABS_API_KEY` is set. ElevenLabs is called with timestamps so captions can follow words. The placeholder lines words up with each shot when the script matches the shot text, and spreads them across the timeline otherwise.

`STUDIO_FORBID_PAID=1` makes every paid provider refuse to run. CI sets it.

## Cost

The CLI prints how many image, video, and voice calls a run will make, and how many are already cached. It does not invent a dollar amount. fal.ai bills per image and per video second, ElevenLabs bills per character, and both change their prices. Check the provider before you pass `--yes`. The placeholder provider is free.

## Project file

YAML or JSON. See `projects/ocean/project.yaml` and `projects/meme-example/project.yaml`. `studio.config.yaml` supplies defaults. The project wins.

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | |
| `aspect` | yes | `9:16`, `1:1`, or `16:9`. Frames are 720x1280, 1080x1080, or 1280x720 |
| `fps` | no | Default 30 |
| `provider` | no | `auto`, `placeholder`, or `fal` |
| `models.image` | no | fal image endpoint id |
| `models.video` | no | fal video endpoint id |
| `models.voice` | no | ElevenLabs model id |
| `models.videoImageField` | no | Override the start-frame field sent to the video model |
| `models.endImageField` | no | Where the end frame is sent. Default `end_image_url`. Use `tail_image_url` when the model asks for a tail image |
| `models.referenceImageField` | no | Where reference stills are sent. Default `reference_image_urls` |
| `assets` | no | Folder of your own files. Paths below are looked up here first |
| `references.style` | no | Global style still, sent with every generated shot |
| `references.character` | no | Global character still, sent with every generated shot |
| `references.images` | no | More global reference stills |
| `shots` | yes | At least one |
| `shots[].id` | yes | Short id, unique |
| `shots[].prompt` | when generating motion | Required for generated motion. A supplied still or clip can omit it. A generated frame can carry its own prompt |
| `shots[].image` | no | Your still. Used as-is, or as the start frame when `kind` is `video` or `end_image` is set |
| `shots[].start_image` | no | Start frame. A path, or `{ prompt }` to generate one. Same role as `image` |
| `shots[].end_image` | no | End frame. A path, or `{ prompt }` to generate one. The video is the motion from the start frame to this still |
| `shots[].start_from` | no | `previous` uses the previous shot's last frame as `start_image` |
| `shots[].video` | no | Your clip, trimmed to `duration` and fitted to the frame. No model call |
| `shots[].reference_images` | no | Extra stills for this shot, after the global ones |
| `shots[].duration` | yes | Seconds, greater than 0 and at most 120 |
| `shots[].kind` | no | `image` (default) or `video` |
| `shots[].videoMode` | no | `image-to-video` (default) or `text-to-video` |
| `shots[].camera` | no | `static`, `ken-burns-in`, `ken-burns-out`, `pan-left`, `pan-right`, `slow-push` |
| `shots[].text` | no | On-screen line. Becomes captions when there is no voiceover |
| `voiceover.script` | no | Spoken line |
| `voiceover.provider` | no | `auto`, `placeholder`, or `elevenlabs` |
| `voiceover.voiceId` | no | ElevenLabs voice id |
| `music.file` | no | Path relative to the project file |
| `music.volume` | no | 0 to 1, default 0.25 |
| `sfx[].file` | no | Path relative to the project file |
| `sfx[].at` | no | Start time in seconds |
| `sfx[].volume` | no | 0 to 1, default 0.8 |
| `captions.style` | no | `impact`, `clean`, or `minimal` |
| `edit.snapCutsToBeats` | no | Move interior cuts onto detected beats |
| `edit.snapWindowSec` | no | How far a cut may move, default 0.25 |

Validation errors name the field, for example `shots.0.duration: Duration must be greater than 0`.

## Your own media

Put stills and clips in a folder next to the project and point `assets` at it. A path is resolved in that folder, then next to the project file, then in the current directory.

`image` skips image generation. On an image shot the edit uses that still, including Ken Burns. On a video shot it is the start frame for image-to-video, so you pay for the video only. `video` skips generation entirely: the clip is trimmed to the shot duration and fitted to the frame. Set one of those, not both.

`references.style` and `references.character` keep a look or a person consistent across shots. Each shot can add `reference_images`. Those files are passed through on fal calls. See `projects/own-media/project.yaml`. Drop the files in that project's `images/` folder.

```yaml
title: Brought Media
aspect: "16:9"
fps: 30
provider: placeholder
assets: images
references:
  style: style.png
  character: character.png
shots:
  - id: photo
    image: photo.jpg
    duration: 2
    camera: ken-burns-in
    text: Your still
  - id: animated
    kind: video
    image: photo.jpg
    duration: 2
    prompt: Slow push across the supplied photo
    reference_images:
      - character.png
  - id: clip
    video: clip.mp4
    duration: 2
    text: Your clip
```

```bash
make dry own-media
```

## First and last frame

A video model that accepts a start frame and an end frame can fill in the motion between two pictures. `start_image` and `end_image` are each either a path or `{ prompt: ... }` when the still itself should be generated. `image` is the shorthand for a start frame you already have. `start_from: previous` uses the previous shot's last frame, so a sequence of photos plays as one continuous story. The first shot cannot use `previous`.

`projects/bridge/project.yaml` is photo A, a generated transition into photo B, then photo B:

```yaml
shots:
  - id: photo-a
    image: photo.jpg
    duration: 1.5
    text: Photo A
  - id: crossing
    start_from: previous
    end_image: photo-b.jpg
    duration: 2
    prompt: The camera travels from the first photo into the second, one continuous move
  - id: photo-b
    image: photo-b.jpg
    duration: 1.5
    text: Photo B
```

On fal, that crossing calls the video model with the start still and `end_image_url` (or `models.endImageField`). Seedance 2.0 and Kling v3 (`fal-ai/kling-video/v3/pro/image-to-video`, start field `start_image_url`) both accept `end_image_url`. The placeholder crossfades the two stills. Photo A and photo B are not billed. The previous frame is not billed again. Only the transition video is a paid call, plus any frame you asked the image model to generate.

Frames can be generated instead of supplied:

```yaml
  - id: dawn-to-dusk
    start_image:
      prompt: A quiet harbor at dawn, same boat
    end_image:
      prompt: The same harbor at dusk, lights on
    prompt: Time passes in one slow move
    duration: 4
```

```bash
make dry bridge
```

Captions come from voiceover word timings when a voiceover exists. Otherwise they come from each shot's `text`. `impact` is bold centered meme type, `clean` is a bottom subtitle, `minimal` is a smaller lower-third. The current word is highlighted.

## Audio analysis

Music is decoded with ffmpeg and tracked in TypeScript (energy envelope, onsets, autocorrelation tempo). The result is `projects/<name>/work/analysis/music.json`:

```json
{ "source": "energy", "bpm": 120, "onsets": [0, 0.5], "beats": [0, 0.5] }
```

Word timings are `projects/<name>/work/voice/words.json`. Cuts snap to beats when `edit.snapCutsToBeats` is true. Captions snap to those words.

Optional Python extras, not installed by `npm install` and not used in CI:

```bash
pip install -r requirements-audio.txt   # librosa, for --analyzer python
pip install openai-whisper              # for --whisper
```

`--analyzer python` runs `python/analyze_audio.py`. `--whisper` runs `python/whisper_words.py` (the base model download is large).

## Edit and render

`src/composition/StudioVideo.tsx` is the Remotion composition. What you see at a frame depends only on the render plan and the time: which shot is active, the Ken Burns or pan transform on stills, the caption cue, and the audio. `render` bundles that composition and encodes an H.264 MP4, or the ffmpeg renderer builds the same timeline with zoompan, ASS captions, and an audio mix. The Makefile writes `projects/<name>/output.mp4`. Takes stay in `projects/<name>/work/`. Both are gitignored, along with `.env`.

## Development

```bash
npm run lint
npm run typecheck
npm test
```

GitHub Actions runs those, then renders the example projects with the placeholder provider and ffmpeg. Do not put real keys in the repo. Do not call paid APIs from CI.

## License

MIT. See [LICENSE](LICENSE).
