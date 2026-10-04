import { createInterface } from 'node:readline';

export async function confirmPaid(count: number, yes: boolean, noun = 'paid API call'): Promise<void> {
  if (count <= 0) return;
  if (yes) return;
  if (!process.stdin.isTTY) {
    throw new Error(
      `Refusing ${count} ${noun}${count === 1 ? '' : 's'} without --yes (stdin is not a terminal).`,
    );
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(`Run ${count} ${noun}${count === 1 ? '' : 's'}? (yes / no) `, resolve);
  });
  rl.close();
  if (!/^y(es)?$/i.test(answer.trim())) {
    throw new Error('Cancelled. Nothing was generated.');
  }
}
