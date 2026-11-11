import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost'
      }
    },
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/renderer/src/vite-env.d.ts'],
      thresholds: {
        statements: 40,
        branches: 40,
        functions: 40,
        lines: 40,
        'src/main/playlistImportValidation.ts': {
          statements: 80,
          branches: 75,
          functions: 90,
          lines: 80
        },
        'src/main/appUpdate.ts': {
          statements: 80,
          branches: 75,
          functions: 70,
          lines: 80
        },
        'src/main/recordingPaths.ts': {
          statements: 90,
          branches: 85,
          functions: 90,
          lines: 90
        },
        'src/main/recordingSessionRegistry.ts': {
          statements: 80,
          branches: 70,
          functions: 85,
          lines: 80
        },
        'src/renderer/src/audio/bpm.ts': {
          statements: 80,
          branches: 70,
          functions: 85,
          lines: 80
        },
        'src/main/recording.ts': {
          statements: 58,
          branches: 31,
          functions: 43,
          lines: 60
        },
        'src/main/window.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90
        },
        'src/main/appSecurity.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90
        },
        'src/renderer/src/hooks/useEngine.ts': {
          statements: 70,
          branches: 60,
          functions: 60,
          lines: 70
        },
        'src/renderer/src/audio/{deckChannel,deckLoops,deckPersistence,deckTrackLoader,deckTransport,monoSamples}.ts': {
          statements: 80,
          branches: 70,
          functions: 80,
          lines: 80
        },
        'src/renderer/src/hooks/{useDeckLoading,useEngineOutput,useRecorder,useTransportTicker}.ts': {
          statements: 85,
          branches: 75,
          functions: 85,
          lines: 85
        },
        'src/renderer/src/library/{audioMetadata,concurrentTasks,libraryFiles,libraryRepository}.ts': {
          statements: 75,
          branches: 65,
          functions: 65,
          lines: 75
        },
        'src/renderer/src/performance/*.ts': {
          statements: 90,
          branches: 80,
          functions: 90,
          lines: 90
        }
      }
    }
  }
})
