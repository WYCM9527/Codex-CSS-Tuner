import { Daemon } from '../daemon';

const daemon = new Daemon();
daemon.start().then(
  (ok) => {
    if (!ok) process.exit(0);
  },
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
