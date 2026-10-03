import { StudioError } from './util/ffmpeg.js';

type Command = 'generate' | 'render' | 'all' | 'takes' | 'select' | 'help';

export type CliArgs = {
  command: Command;
  project?: string;
  yes: boolean;
  dryRun: boolean;
  fresh: boolean;
  whisper: boolean;
  provider?: string;
  renderer: 'remotion' | 'ffmpeg';
  analyzer: 'energy' | 'python';
  shotId?: string;
  takeId?: string;
};

export const HELP = `ai-studio — open-source AI video studio

Usage
  npm run studio -- generate <project.yaml> [flags]
  npm run studio -- render <project.yaml> [--renderer remotion|ffmpeg]
  npm run studio -- all <project.yaml> [flags]
  npm run studio -- takes <project.yaml>
  npm run studio -- select <project.yaml> <shotId> <takeId>

Flags
  --yes                 Run paid generations without a confirmation prompt
  --dry-run             Print the paid-call estimate and exit
  --fresh               Ignore cached takes and generate new ones
  --provider <name>     placeholder, fal, or auto (default: the project file)
  --renderer <name>     remotion (default) or ffmpeg
  --whisper             Replace voice timestamps with local Whisper (optional)
  --analyzer <name>     energy (default) or python (optional librosa)

Examples
  npm run studio -- all projects/ocean.yaml --yes
  npm run studio -- generate projects/meme-example.yaml --dry-run
  npm run studio -- select projects/ocean.yaml horizon image-1
`;

export function parseArgs(argv: string[]): CliArgs {
  const tokens = argv.slice(2);
  const command = (tokens[0] ?? 'help') as Command;
  const known: Command[] = ['generate', 'render', 'all', 'takes', 'select', 'help'];
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
  if (!positionals[0]) throw new StudioError(`Missing project file.\n\n${HELP}`);
  args.project = positionals[0];
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
