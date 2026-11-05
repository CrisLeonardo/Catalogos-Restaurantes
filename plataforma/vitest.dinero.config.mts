import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

// Solo este comando carga el entorno local; npm test sigue sin depender de BD.
for (const [key, value] of Object.entries(loadEnv('test', process.cwd(), ''))) {
  process.env[key] ??= value;
}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/integration/dinero.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
