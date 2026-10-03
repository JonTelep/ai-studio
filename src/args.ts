import { StudioError } from './util/ffmpeg.js';

type Command =
  | 'generate'
  | 'render'
  | 'all'
  | 'takes'
  | 'select'
  | 'help'
  | 'new'
  | 'validate'
  | 'dry'
  | 'images'
  | 'prod'
  | 'redo';

export type CliArgs = {
  command: Command;
  project?: string;
  name?: string;
  yes: boolean;
  dryRun: boolean;
  fresh: boolean;
  whisper: boolean;
  provider?: string;
  renderer: 'remotion' | 'ffmpeg';
  analyzer: 'energy' | 'python';
  shotId?: string;
  takeId?: string;
  stage?: 'image' | 'video';
};

export const HELP = `ai-studio — open-source AI video studio

Usage
  npm run studio -- generate <project.yaml> [flags]
  npm run studio -- render <project.yaml> [--renderer remotion|ffmpeg]
  npm run studio -- all <project.yaml> [flags]
  npm run studio -- takes <project.yaml>
  npm run studio -- select <project.yaml> <shotId> <takeId>
  npm run studio -- new <name>
  npm run studio -- validate <project.yaml>
  npm run studio -- dry <project.yaml>
  npm run studio -- images <project.yaml>
  npm run studio -- prod <project.yaml> [--renderer ffmpeg]
  npm run studio -- redo <project.yaml> <shotId> [--stage image|video]

Flags
  --yes                 Run paid generations without a confirmation prompt
  --dry-run             Print the paid-call estimate and exit
  --fresh               Ignore cached takes and generate new ones
  --provider <name>     placeholder, fal, or auto (default: the project file)
  --renderer <name>     remotion (default) or ffmpeg
  --stage <name>        image or video, for redo
  --whisper             Replace voice timestamps with local Whisper (optional)
  --analyzer <name>     energy (default) or python (optional librosa)

The Makefile is the usual way in: make dry <name>, make images <name>, make prod <name>.
It does not pass --yes. Confirm a paid count in the terminal before it runs.

Examples
  npm run studio -- all projects/ocean/project.yaml --yes --renderer ffmpeg
  npm run studio -- dry projects/ocean/project.yaml
  npm run studio -- select projects/ocean/project.yaml horizon image-1
`;

export function parseArgs(argv: string[]): CliArgs {
  const tokens = argv.slice(2);
  const command = (tokens[0] ?? 'help') as Command;
  const known: Command[] = [
    'generate',
    'render',
    'all',
    'takes',
    'select',
    'help',
    'new',
    'validate',
    'dry',
    'images',
    'prod',
    'redo',
  ];
  if (!known.includes(command)) {
    throw new StudioError(`Unknown command "${command}".\n\n${HELP}`);
  }
  const args: CliArgs = {
    command,
    yes: false,
    dryRun: false,
    fresh: false,
    whisper: false,
    renderer: 'remotion',
    analyzer: 'energy',
  };
  const positionals: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (token === '--yes') args.yes = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--fresh') args.fresh = true;
    else if (token === '--whisper') args.whisper = true;
    else if (token === '--provider') {
      args.provider = requiredValue(token, next);
      i += 1;
    } else if (token === '--renderer') {
      const value = requiredValue(token, next);
      if (value !== 'remotion' && value !== 'ffmpeg') {
        throw new StudioError(`Unknown renderer "${value}". Use remotion or ffmpeg.`);
      }
      args.renderer = value;
      i += 1;
    }     else if (token === '--stage') {
      const value = requiredValue(token, next);
      if (value !== 'image' && value !== 'video') {
        throw new StudioError(`Unknown stage "${value}". Use image or video.`);
      }
      args.stage = value;
      i += 1;
    } else if (token === '--analyzer') {
      const value = requiredValue(token, next);
      if (value !== 'energy' && value !== 'python') {
        throw new StudioError(`Unknown analyzer "${value}". Use energy or python.`);
      }
      args.analyzer = value;
      i += 1;
    } else if (token.startsWith('--')) {
      throw new StudioError(`Unknown flag "${token}".\n\n${HELP}`);
    } else {
      positionals.push(token);
    }
  }
  if (command === 'help') return args;
  if (command === 'new') {
    if (!positionals[0]) throw new StudioError(`new needs a project name.\n\n${HELP}`);
    args.name = positionals[0];
    return args;
  }
  if (!positionals[0]) throw new StudioError(`Missing project file.\n\n${HELP}`);
  args.project = positionals[0];
  if (command === 'redo') {
    if (!positionals[1]) throw new StudioError(`redo needs a shot id.\n\n${HELP}`);
    args.shotId = positionals[1];
  }
  if (command === 'select') {
    if (!positionals[1] || !positionals[2]) {
      throw new StudioError(`select needs a shot id and a take id.\n\n${HELP}`);
    }
    args.shotId = positionals[1];
    args.takeId = positionals[2];
  }
  return args;
}

function requiredValue(flag: string, value: string | undefined): string {
  if (!value || value.startsWith('--')) throw new StudioError(`${flag} needs a value.`);
  return value;
}
