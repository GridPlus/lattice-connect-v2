/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true, // Use Vitest global APIs like describe, it, expect
    environment: 'happy-dom', // Use happy-dom for DOM simulation
    setupFiles: './src/setupTests.ts', // Optional setup file
    css: true, // Enable CSS processing if needed for tests
  },
});
