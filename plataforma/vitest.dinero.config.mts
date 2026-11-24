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
    include: ['tests/integration/dinero.test.ts', 'tests/integration/permisos.test.ts', 'tests/integration/recepcion.test.ts', 'tests/integration/catalogo.test.ts', 'tests/integration/inventario.test.ts', 'tests/integration/precio-acordado.test.ts', 'tests/integration/olvidar-comensal.test.ts', 'tests/integration/archivos-del-local.test.ts', 'tests/integration/prueba-gradua.test.ts', 'tests/integration/purga-datos.test.ts'],
    // Base al día y funciones críticas iguales al repositorio (auditoría 2026-11-23).
    globalSetup: ['tests/integration/preflight.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
