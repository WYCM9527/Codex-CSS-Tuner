import { Daemon } from '../daemon';

new Daemon({ extension: true }).start().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
