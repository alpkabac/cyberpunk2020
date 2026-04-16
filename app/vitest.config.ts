import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = { '@': path.resolve(__dirname, './') };

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    environment: 'node',
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
          exclude: ['lib/**/*.property.test.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'property',
          globals: true,
          environment: 'node',
          include: ['lib/**/*.property.test.ts'],
        },
      },
    ],
  },
});
