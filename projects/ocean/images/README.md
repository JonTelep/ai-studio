# images

Drop your own photos and clips in this folder.

- Stills (`.jpg`, `.png`, `.webp`) can be a shot's `image`, `start_image`, or `end_image`.
- A clip (`.mp4`, `.mov`, `.webm`) can be a shot's `video`. It is trimmed to the shot duration.
- Reference stills for a style or a character go here too, then are named under `references` or `reference_images`.

Paths in `project.yaml` are looked up here when `assets: images` is set.

`make images` does not regenerate these files. `make dry` checks that every referenced file exists and prints its dimensions.
