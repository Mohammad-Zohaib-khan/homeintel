import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vite.config.js';
export default mergeConfig(base, defineConfig({ test: { environment: 'jsdom', setupFiles: ['./src/test/setup.js'], globals: true, css: false, testTimeout: 15_000 } }));
// testTimeout: the first render of a lazy route compiles its chunk; on a busy 2-core CI runner that can pass 5 s.
