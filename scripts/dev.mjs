// Development: API/site server on :3000 (restarts on change) and the admin with HMR on :5173.
import { spawn } from 'node:child_process';

const run = (cmd, args) => spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
const server = run('npx', ['tsx', 'watch', '--clear-screen=false', 'src/server/index.ts']);
const admin = run('npx', ['vite', '--config', 'vite.config.ts']);
console.log('\n  Website:  http://localhost:3000\n  Admin:    http://localhost:5173/admin/\n');
const stop = () => {
  server.kill();
  admin.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
