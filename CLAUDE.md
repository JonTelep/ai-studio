# ai-studio

This repo turns a shot list into a short video. You are editing a project folder. The human runs Make. You write `project.yaml`. You do not spend money.

## Workflow

Do these in order. Do not skip ahead.

1. `make new <name>` creates `projects/<name>/`.
2. The human writes `projects/<name>/idea.md` and drops photos in `projects/<name>/images/`.
3. `make script <name>` is how you get here. Read the idea, the images, and this file. Write `projects/<name>/project.yaml`.
4. `make dry <name>` validates the file, checks that referenced images exist and prints their dimensions, renders a free placeholder preview, and prints the paid-call count. Always run dry before images or prod.
5. `make images <name>` generates stills only (it skips files the human already supplied) and writes `contact-sheet.jpg`.
6. `make prod <name>` generates video, voice, and sound, then renders `output.mp4`. It refuses to start when a shot that needs a still does not have one. The human runs `make images` first.

`make shots <name>` (alias `make list`) prints the numbered shot table. `shot=` on `make redo` and `make pick` accepts that number or the shot id. `make redo <name> shot=<n>` regenerates one shot. `make render <name>` re-renders without generating. `make takes` and `make pick` choose an earlier take.

## Rules

- Always run dry before images or prod. If you were asked to update `project.yaml`, validate it with `npm run studio -- validate projects/<name>/project.yaml` and stop.
- Images before prod. Do not run `make prod`, `make images`, or the studio `generate` / `all` / `prod` commands yourself.
- Never run a paid command. Never pass `--yes`. Never set `provider` to `fal` unless the human's idea says they want fal and they have already agreed to the spend. Leave `provider: placeholder` when you are unsure.
- Never read `.env`, never print `.env`, and never echo `FAL_KEY` or `ELEVENLABS_API_KEY`.
- Do not invent dollar prices. The dry command prints how many calls would be billed.

## Project folder

```
projects/<name>/project.yaml    shot list
projects/<name>/idea.md         plain-words description
projects/<name>/images/         photos and clips the human supplied
projects/<name>/work/           generated takes (gitignored)
projects/<name>/output.mp4      final render (gitignored)
projects/<name>/contact-sheet.jpg
```

`assets: images` makes paths resolve inside `images/` first.

`title`, `aspect` (`9:16`, `1:1`, or `16:9`), and `shots` are required. `fps` defaults to 30. Each shot needs an `id` and a `duration` in seconds.

A shot that generates a picture needs a `prompt`. A shot that only displays a file can omit it. A shot that generates motion between frames needs a prompt for the motion. A generated frame can carry its own prompt:

```yaml
start_image:
  prompt: A quiet harbor at dawn, same boat
end_image:
  prompt: The same harbor at dusk, lights on
```

## Own media

```yaml
assets: images
shots:
  - id: photo
    image: photo.jpg
    duration: 2
  - id: animated
    kind: video
    image: photo.jpg
    duration: 2
    prompt: Slow push across the photo
  - id: clip
    video: clip.mp4
    duration: 2
```

`image` uses their still instead of generating one. On a video shot it is the start frame, so only the video is billed. `video` uses their clip as-is, trimmed to `duration`. Set `image` or `video`, not both.

`references.style` and `references.character` are sent with every generated shot. A shot can add `reference_images`. Those files must live in `images/` (or be a path the project can read).

## First and last frame

`start_image` and `end_image` are each a path or `{ prompt }`. The video model generates the motion between them. `image` is the short name for a start frame the human already has.

`start_from: previous` uses the previous shot's last frame as the start, so a sequence of photos plays as one story. The first shot cannot use `previous`.

```yaml
shots:
  - id: photo-a
    image: photo-a.jpg
    duration: 1.5
    text: Photo A
  - id: crossing
    start_from: previous
    end_image: photo-b.jpg
    duration: 2
    prompt: The camera travels from the first photo into the second
  - id: photo-b
    image: photo-b.jpg
    duration: 1.5
    text: Photo B
```

On fal, the end still is sent as `end_image_url`. Set `models.endImageField: tail_image_url` when the model asks for a tail image. Kling image-to-video reads `start_image_url`. Seedance reads `image_url`. The placeholder provider crossfades the two stills, so dry can show the bridge with no key.

A supplied video cannot also set `start_image`, `end_image`, or `start_from`.

## Other fields

- `camera`: `static`, `ken-burns-in`, `ken-burns-out`, `pan-left`, `pan-right`, `slow-push`. Camera moves in the edit apply to stills.
- `text`: on-screen line. It becomes captions when there is no voiceover.
- `kind`: `image` (default) or `video`.
- `videoMode`: `image-to-video` (default) or `text-to-video`.
- `voiceover.script`, `music.file`, `sfx`, `captions.style` (`impact`, `clean`, `minimal`), `edit.snapCutsToBeats`.

Shot ids are short (`horizon`, `photo-a`) and unique. Durations are greater than 0 and at most 120 seconds.
