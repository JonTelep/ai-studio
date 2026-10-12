# Minimal Studio — a visual workspace for JSON-driven videos

Plan revision: 1, 2026-10-12 UTC.
Recon snapshot: `b54211c159f21d7447422df9de0d087a435d103e` on
`cursor/ai-studio-v1-26f7`, plus the existing uncommitted production work described below.
This PR contains planning only. It does not implement the frontend or commit that production work.

## Outcome and scope

Open a local browser app, find a project, preview its images and videos, change
shots and assets, generate selected material, compare takes, and render/download
the finished video without editing JSON or switching to a terminal for each action.
The existing project files remain usable by the CLI and external coding agents.

User requirements: a minimal interface, fast access to generated images/videos,
project organization, and adding/changing material on demand. The working
JSON-to-video pipeline is the foundation, not a replacement target.

Planning assumptions: one person on this machine; a visual editor with an optional
instruction box; projects stored on disk; desktop first with a usable narrow
layout. These are defaults inferred from the conversation, not separately approved
requirements. Prompt 1 checks the file assumptions; Prompt 6 includes human visual
evaluation. Change the plan if remote hosting or collaboration becomes a requirement.

Include project creation, search, display-name changes, duplication, reversible
archive, media upload, shot add/reorder/remove, prompt and timing edits, caption
and audio controls, selective generation, take selection, progress, preview,
export, and a constrained assistant that proposes script revisions.

Exclude accounts, billing subscriptions, cloud storage, team collaboration,
automatic X posting, a multitrack editing suite, arbitrary model browsing,
automatic face tracking, and guaranteed lip sync. Multi-character voice synthesis
remains a later extension: preserve/play existing mixed dialogue, support the
generic single-voice workflow, and clearly distinguish script text from recorded
speech. Editing text must never imply that supplied speech has been regenerated.

## Product shape

Two screens, with small drawers rather than a collection of dashboards:

1. **Library:** media thumbnails, name, duration, modified time, and honest status.
   Search, create, duplicate, archive, and restore. Empty projects have a useful
   starting action. Broken projects remain visible with a repair message.
2. **Workspace:** compact project navigation; a large preview; a horizontal shot
   strip; a contextual inspector. Tabs in the preview distinguish a selected image,
   a selected clip, the last assembled preview, and the final export. A take drawer
   compares alternatives. A collapsed instruction box proposes changes to the
   selected shot or whole project.

Use a restrained charcoal canvas, neutral typography, one action accent, compact
controls, and generous space around the actual media. No marketing page, decorative
metrics, nested card grids, or chat feed dominating the editor. Show pipeline
details only when they help someone understand cost, progress, or a failure.

The player needs a visible volume slider separate from mute, a modest initial
volume (25%), persistence of the user's setting, scrubbing, and fullscreen.
Do not autoplay audible media; pause one preview when another starts. A volume
change affects listening only, not the export's audio mix.

## Reconnaissance and reuse inventory

Paths and line numbers below describe the inspected working tree. **W** means the
relevant behavior is changed or added locally and is not supplied by this plan PR.
Prompt 1 must reconcile these facts against its actual checkout before relying on them.

| Evidence | Observed behavior and implication |
| --- | --- |
| `package.json:14` scripts; `package.json:21` dependencies | TypeScript, React, Zod, Vitest, and Remotion already exist. No app server or browser app scripts exist. Reuse types, validation, and React. |
| `src/project/load.ts:64` `loadProject`; `src/project/schema.ts:149` `ProjectObjectSchema` | JSON/YAML parsing, config merging, schema validation, and defaults exist. Do not create a second project schema. Preserve explicit values versus inherited defaults when saving. |
| **W** `src/project/layout.ts:14` `layoutFor`; **W** `Makefile:17` | Local changes give JSON projects isolated work/output folders and Make preference over YAML. At HEAD, JSON loads, but layout only recognizes `project.yaml`/`.yml` as project-folder files. This is a real prerequisite, not a merged feature. |
| `src/workflow.ts:86` `scaffoldProject` | Scaffolds YAML; checks only that YAML file. Web creation must also protect existing JSON/YML folders. |
| `src/pipeline/generate.ts:282` `generateProject`; `:399` estimate/confirmation | Cache-aware planning, stage scopes, and per-shot refresh already exist. Progress is console-oriented. Extract/reuse structured planning; do not parse terminal output as the API. |
| `src/pipeline/estimate.ts:12` `Estimate`; `:92` `formatEstimate` | Reports paid-call counts, not dollar quotes. The frontend must not present a call count as a price. |
| `src/pipeline/manifest.ts:33` `Manifest`; `:83` `reusableTake`; `:112` `selectTake` | Existing takes and selections are the source of truth. Writes at `:73` are synchronous, non-atomic file replacement; add shared writer coordination before web mutations. |
| `src/pipeline/stills.ts:20` `stillGaps`; `src/workflow.ts:302` `redoShot` | Still readiness and selected-shot regeneration have reusable rules. Surface missing prerequisites, preserve previous takes. |
| `src/pipeline/paths.ts:6` `resolveAsset` | CLI accepts absolute paths and falls back to the working directory. This is not a safe media-serving boundary. Browser routes need narrower, canonical project-scoped paths. |
| `src/providers/fal.ts:63` `falMedia`; `:97` `fal.subscribe` | Generic adapter uploads and generates but does not persist a request receipt before waiting. Its video payload clamps duration and does not send explicit resolution. Do not advertise every model setting as supported. |
| `src/providers/registry.ts:7`; `src/pipeline/confirm.ts:3` | `auto` selects paid providers when keys exist; terminal confirmation cannot serve browser jobs. Resolve and disclose providers explicitly before a generation action. |
| **W** `src/pipeline/render.ts:19` `renderProject`; **W** `src/pipeline/finish.ts:10` | Local finishing supports captions, mix normalization, and exports. Publishing currently copies over `output.mp4`; preserve the previous export until a new render succeeds. |
| **W** `src/audio/dialogue.ts:25` `readDialogue`; **W** `src/composition/overhead.ts:4` | Imported multi-speaker timings and authored overhead captions are local capabilities. Preserve them when opening the proof-of-concept; no automatic head tracking is present. |
| `Makefile:61` `script` target | Existing assistant integration invokes local Claude Code to write a file. The UI should request a candidate document, validate it, and let the user apply it instead of granting an agent live edit access. |
| **W** `scripts/produce-partyhat.ts:30` `falJob`; `:122` `video` | Project-specific runner persists request IDs and unknown-submission markers. Reuse the recovery ideas in generic providers; do not make the web app depend on this one project. |
| **W** `scripts/assemble-partyhat.ts:1`; **W** `projects/purple-partyhat/project.json:1` | The successful short includes local assembly, supplied recordings, and retiming. It proves the media pipeline, not a universal one-click cast/lip-sync product. |
| `test/workflow.test.ts:33`; **W** `test/production.test.ts:25` | Tests use temporary projects and actual FFmpeg. Follow that pattern for meaningful integration tests rather than only mocking services. |

The dirty tree also includes editorial/export changes, cache invalidation fixes,
voice timing changes, Make/CI updates, example projects, and generated local media.
Do not stage or discard it as part of this planning PR. The current branch already
contains CLI work absent from `main`; base this plan PR on that branch so its diff
is just the plan. Before implementation, explicitly record which production commits
have landed. Port missing required behavior in reviewed changes rather than assuming
untracked scripts or media are available in CI.

### Investigation results and architecture decisions

- **Can this be a static frontend?** Inspected generation, file IO, credentials,
  and FFmpeg calls. They require a local backend. Choose a React/TypeScript client
  and a small Node HTTP service importing the pipeline. Vite is the proposed client
  bundler; verify compatible versions during installation. No full-stack framework,
  database, or Redis queue is needed for one local user. Revisit storage/queue choices
  only with multiple workers/users or measured file-store limits.
- **Can jobs just shell out to Make?** Non-TTY paid confirmation fails, progress is
  free text, and jobs need recovery. Choose typed service calls plus worker processes
  with structured events. Keep the existing CLI as a caller of the same functions.
  Use one executing media job globally initially and a persistent FIFO queue.
- **Can the successful paid example be exposed unchanged?** No: it used a custom
  runner. Prompt 4 gates paid UI controls on verified generic adapter capabilities,
  including references, supported durations, resolution, and request recovery.
- **Can the instruction box use an installed assistant?** `command -v claude`
  succeeded. Local `claude --help` documents print mode, JSON-schema output,
  `--tools ""`, strict MCP configuration, and session-persistence controls. No model
  request or authentication test was made. Prompt 5 verifies the exact invocation
  without trusting availability of an executable to imply a usable subscription.
  Reuse this existing integration before adding an SDK or a second paid account.
- **Where does state live?** Project documents/assets and manifests retain their
  existing roles. Planned `.studio/` sidecars store UI metadata, revisions, and job
  records; they do not replace `project.json`. Prefer atomic JSON writes and typed
  records. Keep secrets server-side. Serve on loopback, same origin, with browser
  origin/host checks on mutations; remote access is out of scope for this version.

## Sequencing and acceptance

Run sequentially: **Prompt 1 → 2 → 3 → 4 → 5 → 6**. Shared file contracts make
parallel implementation unhelpful here. The user gets a useful read-only media
workspace after Prompt 1, an editor after Prompt 2, and free background previews
after Prompt 3. Paid generation and assistant revisions follow separately.

No open human decision prevents planning. The visual-workspace assumption can be
revised before implementation. This request authorizes the plan, commit, push, and
PR; it does not authorize implementing the series or new model calls. The earlier
production spend was for that short, not a standing CI/test budget.

| Material outcome | Evidence and pass criterion | Owner |
| --- | --- | --- |
| Existing projects are visible | JSON/YAML fixtures, invalid-project card, supplied assets, selected takes, and generated export load through real HTTP routes | 1 |
| Easy playback | Browser can seek via range requests, adjust volume without muting, switch previews, and retain volume after reload | 1, 6 |
| Organize/edit without losing work | Create/rename/duplicate/archive/restore; reopen disk changes; stale saves fail with conflict; undo returns previous valid revision | 2 |
| Add assets and shots | Upload and attach image/video/audio/reference; add/reorder/remove a shot; validate dependent `start_from` chains | 2 |
| Rendering survives navigation | Real placeholder job completes after closing/reopening the tab; export is valid; failed render preserves last good output | 3 |
| Change only intended paid material | Estimate/execution agree on exact inputs; duplicate request submits once; cached assets reused; selected prior takes preserved | 4 |
| Recover failures honestly | Worker/server restart recovers known request IDs; unknown submissions require reconciliation, never automatic paid replay | 3, 4 |
| Revise by instruction | Candidate script/shot changes validate and display a diff; discard leaves disk untouched; applying an outdated proposal conflicts | 5 |
| Product is usable and compatible | Integrated browser scenario, keyboard/narrow-layout inspection, CLI regression suite, clear setup docs | 6 |

**Final integration:** in a temporary project root, create a three-shot short,
upload a still, edit prompts/text/duration, generate free previews, navigate away
and reopen, compare/select takes, apply a proposed revision, rerender, and download
an MP4 that decodes. Restart the server during a mocked paid request and prove it
does not resubmit. Confirm a second project is unaffected and CLI still works.
Use synthetic or tracked assets, not the uncommitted RuneScape media, in CI.

**Baseline actually exercised:** `npm run check` passed lint/typecheck, then reported
50 passing tests and three subprocess `EPERM` failures (`ffprobe` and `make`) in
the sandbox. Retried `node node_modules/vitest/vitest.mjs run` outside the sandbox:
all 53 tests across 14 files passed. These are results for the dirty recon snapshot,
not a claim about the plan-only checkout. No paid API calls were made.

**Planned commands, not yet available or verified:** Prompt 1 adds
`npm run studio:web` and `npm run build:web`; Prompt 6 adds `npm run test:web`.
Final gates from repo root: `npm run check`, `npm run build:web`,
`STUDIO_FORBID_PAID=1 npm run test:web`, and the browser scenario above. Document
browser installation/prerequisites when adding the test runner. Existing free
smoke command: `STUDIO_FORBID_PAID=1 make dry own-media`; exercise it in a disposable
checkout/root so verification does not overwrite user exports.

**Execution contract:** dispatch one complete prompt with these constraints and
accepted prerequisite contracts. Recheck source facts; investigate discrepancies,
amend the plan, and update downstream tasks before continuing. Local fixes and
checks belong to implementation; deployment and new paid samples require their
own task authorization. Each task report states files changed, exact check results,
deviations, and remaining uncertainty. The implementing task does not commit; the
orchestrator reviews the diff and commits the accepted task.

---

## Prompt 1: Open existing projects in a minimal media workspace

**Goal:** ship a working library and read-only project viewer, with a reconciled base.
**Depends on:** none.
**Prerequisite contracts:** repo/CLI at the recon base; inventory the dirty-production
capabilities above. Record accepted commits in `docs/studio-baseline.md` (planned
artifact). If required changes are absent, restore the JSON layout, cache/timing,
and imported-dialogue contracts in reviewed prerequisite changes. Do not silently
drop proof-of-concept support or copy private media into fixtures.
**Evidence:** `loadProject`, `layoutFor`, `Manifest`, `resolveAsset`, and package
scripts in the inventory. React is installed; an HTTP service is not.
**Expected edit areas:** planned `src/server/`, `web/`, package scripts/config,
project discovery, media-serving tests, baseline note. Names within those areas are flexible.
**Protected boundaries:** project contents, provider behavior, old CLI commands.

**Fixed:** two-screen layout; loopback server; existing project files authoritative;
JSON preferred when multiple project formats exist; malformed projects visible.
Read model/config/credential readiness as booleans only. No generation on page load.
**Flexible:** component structure, CSS organization, routing helper, server library
if Node's built-in HTTP becomes less maintainable for the required endpoints.
**Escalate when:** a required local-only capability is missing, network sharing is
requested, or importing a project needs a data migration.

**Implementation guidance:**
- Discover projects inside one configured root; assign stable project IDs. Return
  typed project/shot/take summaries and opaque media URLs, not arbitrary file paths.
- Serve only approved project media. Check canonical paths and symlinks, MIME,
  HEAD, range/206, invalid range/416, and missing files. Never serve `.env`, source,
  job receipts, or arbitrary files merely because they are inside the repo.
- Existing external-path assets can be reported as requiring import; never expose
  the filesystem wholesale to preserve a CLI convenience.
- Build the preview, shot strip, and project navigation with real API data. Keep
  controls with no implementation absent. Show distinct original/preview/export states.
- Implement the explicit volume slider, mute button, pause-on-switch, and saved
  25%-initial volume behavior. Add build/start scripts and same-origin dev routing.

**Testing and acceptance:** real HTTP project discovery/media tests; traversal and
symlink rejection; range seek in a browser; keyboard playback controls; JPEG and
MP4 fixtures from existing projects. At 1280×800 the preview and shot strip must
be usable without the inspector crowding the media.
**Invariants:** opening/playing media does not mutate project documents or call a provider.
**Guardrails:** `npm run lint`; `npm run typecheck`; targeted server tests via
`node node_modules/vitest/vitest.mjs run test/server-projects.test.ts`
(planned test file); `npm run build:web` (new). Manually open `npm run studio:web`
and prove range seeking and independent volume control; record exact URL and result.

---

## Prompt 2: Organize projects and edit shots and assets

**Goal:** create and revise projects through controls, then reload identical saved state.
**Depends on:** Prompt 1.
**Prerequisite contracts:** project IDs, typed read routes, confined media lookup,
working viewer, and reconciled pipeline schema from Prompt 1.
**Evidence:** `ProjectObjectSchema`, `scaffoldProject`, `loadProject`, `selectTake`,
and non-atomic `saveManifest` in the inventory.
**Expected edit areas:** server project service, metadata/revision store, upload
handling, shared write/lock helpers, workspace inspector and library actions.
**Protected boundaries:** legacy file validity, supplied assets, existing takes.

**Fixed:** new projects use JSON; preserve format for existing YAML; archive is
reversible; renaming changes display title rather than moving directories; all
writes validate first and atomically replace files. Use a revision token including
the document and relevant inherited config for optimistic concurrency; return
conflict rather than overwriting external edits. Preserve fields absent from the
inspector and do not serialize a flattened `LoadedProject` back to disk.
**Flexible:** field widgets, upload parser, revision retention UI, reorder interaction
provided keyboard move-up/down is available.
**Escalate when:** destructive cleanup, schema redesign, or moving external asset
directories becomes necessary.

**Implementation guidance:**
- Create, search, duplicate, archive/restore, and title-edit. Duplicate owns copies
  of attached inputs and selected media, rewrites references, and starts independent
  job/history state; copying an old manifest verbatim is not sufficient.
- Upload images/videos/audio with size limits, actual media probing, collision-safe
  generated names, and partial-upload cleanup. Attach as shot media/reference/music.
- Add/edit/reorder/remove shots; validate IDs and `start_from: previous` dependencies.
  Prevent removal/reorder from silently changing a dependent shot's starting image.
- Expose prompts, text, duration, camera/fit, captions, music volume, and output
  options supported by the accepted schema. For supplied dialogue, show the recording
  and timings; changing caption text is separate from replacing spoken audio.
- Shared atomic writes and project locks must cover HTTP and CLI mutation paths.
  Permit only one writer per project; take a revision snapshot before mutation and
  offer restore. Mark assembled outputs stale after relevant edits.

**Testing and acceptance:** disk round-trip JSON/YAML including config inheritance;
stale save from a second tab/CLI edit; failed validation leaves files untouched;
duplicate remains playable after the source is archived; upload traversal and bad
media are rejected; undo restores both valid content and stale-output status.
**Invariants:** no edits automatically submit generation; deleting a shot does not
delete its paid media; secrets never enter client state.
**Guardrails:** lint/typecheck plus planned
`node node_modules/vitest/vitest.mjs run test/server-projects.test.ts test/server-edits.test.ts`.
Browser walkthrough: add a shot, upload/attach a reference, save, reload, undo,
duplicate, archive, restore. Verify each action against on-disk state.

---

## Prompt 3: Run free previews and exports as persistent background jobs

**Goal:** jobs continue independently of the browser and preserve usable previous results.
**Depends on:** Prompt 2.
**Prerequisite contracts:** revisioned documents, shared per-project writer locks,
asset IDs, saved edits, and stale-output status from Prompts 1–2.
**Evidence:** `generateProject`, `dryProject`, `renderProject`, `Manifest`, and
console-oriented progress in the inventory.
**Expected edit areas:** planned job store/worker and typed events, pipeline callbacks,
CLI adapters, output publishing, workspace job controls.
**Protected boundaries:** CLI behavior, paid-provider refusal in free mode, prior exports.

**Fixed:** persistent queued/running/succeeded/failed/interrupted/cancelled job states;
one executing media job globally; per-project locks; atomic records; server-assigned
job IDs and client idempotency keys. Record source revision, resolved providers,
effective config, input identities, scope, timestamps, and results. Jobs return an
ID immediately. Poll typed status initially; no WebSockets are required.
**Flexible:** polling interval, worker process wiring, event shape beyond required fields.
**Escalate when:** more than one execution worker is required or an existing pipeline
cannot report progress without a larger internal change.

**Implementation guidance:**
- Expose explicit free-preview and render-existing actions. Free preview forces
  placeholder media AND voice even when credentials and `provider: auto` exist.
  Use isolated preview work so paid takes/output cannot be replaced accidentally.
- Extract shared structured estimation/progress seams; keep console formatting in
  the CLI adapter. Report stages/counts honestly, not an invented percentage.
- Snapshot inputs/effective config and check revisions before execution and publish.
  Block conflicting project mutations while its job runs; other projects stay editable.
  Detect external changes and retain the result as belonging to its original revision.
- Write renders to job-specific temporary outputs, probe success, then publish
  atomically. Retain previous successful output and expose stale/current status.
- Closing a tab does not cancel work. Cancel queued work immediately; stop local
  rendering via process lifecycle control. Server restart classifies unfinished local
  jobs as interrupted and offers deliberate retry; it must not pretend completion.

**Testing and acceptance:** actual free generation/render with FFmpeg, tab reconnect,
server restart, duplicate submission, concurrent CLI/server writes, worker failure,
and failed publish retaining the previous video. Probe duration, streams, and full
decode of a small output. Test missing still prerequisites as an actionable error.
**Invariants:** free preview never reaches a paid adapter, and render-existing never generates.
**Guardrails:** `STUDIO_FORBID_PAID=1 node node_modules/vitest/vitest.mjs run test/server-jobs.test.ts`
(planned), existing pipeline/workflow tests, lint/typecheck. Keep test data in temp
roots; capture restart evidence beyond unit tests of state transitions.

---

## Prompt 4: Generate selected media, compare takes, and recover provider jobs

**Goal:** paid actions are explicit, scoped, cache-aware, and recoverable in the UI.
**Depends on:** Prompt 3.
**Prerequisite contracts:** persistent job identity, immutable effective inputs,
per-project coordination, typed planning/progress, isolated preview, safe publishing.
**Evidence:** `falMedia`, `confirmPaid`, `estimateFromCache`, `stillGaps`, `redoShot`,
and the local production receipt pattern in the inventory.
**Expected edit areas:** generic provider adapters/types, job receipts, stage planning,
generation controls, take drawer, request/payload tests.
**Protected boundaries:** never automatically replay an ambiguous paid submission;
preserve selected take history and reference/cache dependency rules.

**Fixed:** preview the precise scope/provider/model and cached versus new operations
before Generate/Regenerate. Bind execution to the reviewed revision/input fingerprint;
changed inputs require a refreshed plan. Explicit actions authorize the displayed
scope once; do not stack repeated confirmations on an unchanged reviewed job.
Do not invent dollar estimates: show call counts and “price unavailable” until a
dated, verified per-model rate and billing-unit calculation are available.
**Flexible:** small supported-model preset list, comparison layout, receipt storage details.
**Escalate when:** adding a provider/account, native speech/lip-sync generation, or
spending real credits for acceptance is needed beyond the current task authorization.

**Implementation guidance:**
- First verify current official provider schemas for the small offered model set.
  Document supported references, duration, aspect, resolution, voice, and end-frame
  combinations. Correct generic payloads where required; hide unsupported controls.
  Resolution must distinguish source generation from export canvas dimensions.
- Support images for one/all missing shots, motion for one/all ready shots, the
  existing single-voice stage, and selected-shot regeneration. Never regenerate
  everything just because a caption/music change invalidated the final export.
- Persist an intent before remote submission and request ID immediately on receipt.
  Resume polling/downloading known requests after restart. An uncertain submission
  without an ID becomes “needs reconciliation”; require checking provider history
  before a fresh paid retry. Keep this state distinct from safe download retries.
- Cancellation after remote submission is best effort: say it may still be billed,
  retain its receipt, and allow result retrieval. Do not label it refunded.
- Compare/reselect image/video/voice takes; use existing manifest semantics and
  invalidate dependent motion/timings when selecting different source takes.
- Keep assistant/script-project helpers out of the production adapter import graph.

**Testing and acceptance:** mock provider HTTP/SDK boundaries with a counted submit;
prove estimate/execution agreement, exact-once submission under double clicks and
restart, cache reuse, partial completion, failed download recovery, unknown-outcome
handling, and stale quote rejection. Assert actual model payload fields, not just
that an SDK method was called. Browser compare/select changes the preview and next
render without extra paid requests.
**Invariants:** `STUDIO_FORBID_PAID=1` remains enforceable; API credentials never
appear in assets, responses, browser bundles, job error messages, or console logs.
**Guardrails:** lint/typecheck and planned
`STUDIO_FORBID_PAID=1 node node_modules/vitest/vitest.mjs run test/server-generation.test.ts test/providers.test.ts test/production.test.ts`.
Report live-provider testing as unexercised unless specifically authorized; mock
success does not establish visual quality or provider availability.

---

## Prompt 5: Propose script and shot revisions from a short instruction

**Goal:** enter an idea or “make this refusal more sarcastic,” review the proposed
changes, and apply them without granting an assistant direct project mutation.
**Depends on:** Prompt 4.
**Prerequisite contracts:** project revision/restore, editable shot fields, typed
generation plans, and jobs that do not run simply because a document changed.
**Evidence:** existing Claude `Makefile:61` integration and installed CLI help
inspection recorded above. Authentication/model execution remains unverified.
**Expected edit areas:** a server-only drafting adapter, candidate/diff validator,
proposal records, collapsed instruction panel and capability/setup messages.
**Protected boundaries:** no arbitrary shell/file actions from generated text;
no automatic media generation or overwrite of supplied recordings.

**Fixed:** the assistant returns a candidate project/structured change, never edits
live files. Server validates schema, media references, IDs, and allowed changes;
user reviews a concise before/after diff. Applying uses the original revision token
and creates an undoable revision. Discard is a no-op. Assistant usage is separate
from fal credits and must be described accurately in setup/status.
**Flexible:** proposal representation, instruction presets, diff presentation.
**Escalate when:** installed CLI cannot provide constrained structured output with
the user's existing authentication, or a new paid service is proposed.

**Implementation guidance:**
- Bounded probe first: inspect installed help/version and exercise parsing against
  a fake executable. Define argv/stdin and response/error contracts, timeout, and
  output limits. Stop once structured response, no-tools behavior, and failure
  handling are established; record the command in adapter docs. An authenticated
  model call is a separate explicit test, not part of capability detection.
- Spawn with argument arrays, never shell interpolation. Disable built-in tools,
  inherited MCP/tool execution and unneeded hooks/skills; use an isolated working
  directory and allowlisted child environment retaining only required authentication.
  Pass project context explicitly, omit credentials and unrelated filesystem data.
- If setup/auth is unavailable, keep direct editing fully usable and show the
  instruction feature as unavailable with concrete setup steps. Do not report the
  live assistant as verified solely because the fake executable passed.
- Allow whole-project drafting and selected-shot revisions. Preserve asset IDs,
  unrelated shots, unknown-to-inspector supported fields, and supplied dialogue.
  Proposals to change spoken text must explain the need for new speech and timings.

**Testing and acceptance:** fake executable provides valid/invalid JSON, out-of-scope
paths, prompt-injection text, huge output, timeout, unavailable authentication,
and stale revisions. Verify no model-provided command executes and no provider job
starts after Apply. UI diff/discard/apply/undo works through real persistence.
**Invariants:** no assistant-generated file path bypasses asset confinement; the user
can accomplish normal editing with the assistant unavailable.
**Guardrails:** lint/typecheck, planned
`node node_modules/vitest/vitest.mjs run test/server-drafting.test.ts`, and browser
proposal walkthrough with a deterministic drafting fixture. Record live drafting
as verified, failed, or not exercised separately from adapter tests.

---

## Prompt 6: Finish the end-to-end workflow and document operation

**Goal:** a cohesive studio that is straightforward to start and use on this machine.
**Depends on:** Prompt 5.
**Prerequisite contracts:** accepted project/editor/job/generation/proposal APIs and
all earlier acceptance evidence. Missing contracts are implementation gaps, not
features that may silently be omitted from completion.
**Evidence:** existing npm checks, FFmpeg integration tests, Make workflow, and
all product/acceptance requirements in this plan.
**Expected edit areas:** UI polish, browser tests, README/setup, CI, accessibility,
error copy, final evidence note. Add one browser-test dependency if needed.
**Protected boundaries:** no scope expansion into hosting, accounts, publishing,
or paid visual-quality campaigns.

**Fixed:** complete the integrated scenario and verify failure paths; browser
navigation does not lose edits/jobs; player volume/mute remain separate; keyboard
controls, readable focus states, labels, and narrow layout are usable. Empty,
loading, stale, interrupted, and failed states have distinct truthful messages.
**Flexible:** spacing/type refinements, test framework choice, compact screen layout.
**Escalate when:** human evaluation rejects the visual-editor direction or a claimed
capability cannot be demonstrated through the complete system.

**Implementation guidance:**
- Add `npm run test:web` using a disposable project root and placeholder providers.
  Browser tests must use real HTTP, filesystem, and FFmpeg for the free path.
  Mock only external generation/drafting services where required.
- Exercise the final scenario in the acceptance map, plus bad uploads, stale saves,
  selecting older takes, restoring an archived project, and worker/server restart.
- Inspect at 1280×800 and 390×844, including overflowing shot strips and inspector
  scrolling. Provide screenshots for human review; automated checks cannot establish
  that the interface feels minimal or the creative output is engaging.
- Document one startup command, supported media/models, credentials setup without
  printing values, known assistant limitations, job recovery, and project backup.
  Explain preview versus final export, source versus export resolution, and local
  player volume versus rendered audio level where those distinctions matter.
- Keep deployment local. Record remaining deferred limits and their upgrade triggers,
  including the single worker and authored caption positions.

**Testing and acceptance:** all final gates and the integrated browser scenario;
downloaded MP4 decodes; independent project unaffected; no credentials in bundles
or browser responses; CLI smoke workflow still passes. Provide test results plus
human-review artifacts, clearly separating live-provider/assistant checks not run.
**Invariants:** free CI contains no live paid calls; original user projects/media
are never test fixtures that tests mutate.
**Guardrails:** from repo root run `npm run check`, `npm run build:web`, and
`STUDIO_FORBID_PAID=1 npm run test:web`. In a disposable checkout run
`STUDIO_FORBID_PAID=1 make dry own-media`, then fully decode its output with
`ffmpeg -v error -i projects/own-media/output.mp4 -f null -`.

## Plan review record

Local cold review, revision 1: corrected five consequential failure scenarios:
(1) a fresh PR checkout lacks the production additions — explicit Prompt 1 baseline
reconciliation; (2) a browser preview can select paid voice via `auto` — force both
providers free; (3) retries can bill twice — durable intent/receipt and ambiguous
outcome state; (4) CLI and web can overwrite manifests or stale edits — shared
locks/revisions; (5) the successful bespoke short can be mistaken for generic
capability — gate adapter controls and keep multi-character synthesis out of scope.
No unresolved blocking plan findings remain. Nonblocking tradeoffs: static caption
anchors, one media worker, local-only access, and an assistant dependent on separately
verified authentication. Implementation must revalidate the recorded source snapshot.
