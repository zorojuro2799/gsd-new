/**
 * Aegis Edge Kernel — Entry point
 *
 * Run with:  npx ts-node src/index.ts
 * Or after build:  node dist/index.js
 */

import { KernelApp } from './KernelApp';

const kernel = new KernelApp();

kernel.start().catch((err: unknown) => {
  console.error('[KernelApp] Fatal startup error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[KernelApp] Shutting down...');
  kernel.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  kernel.stop();
  process.exit(0);
});
