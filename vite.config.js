import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = name => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: entry('index.html'),
        pilot: entry('pilot.html'),
      },
    },
  },
});
