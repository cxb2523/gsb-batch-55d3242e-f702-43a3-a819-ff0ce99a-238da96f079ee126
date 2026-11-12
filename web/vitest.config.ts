import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The Svelte plugin is here for one reason: `state.svelte.ts` uses runes, and the
// editor's move, rotate and clipboard logic lives in it. That logic is where the
// connection-preserving rules are, so it has to be testable without a browser.
export default defineConfig({
	plugins: [svelte()],
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url))
		},
		// Vitest must load the browser build of Svelte, not the SSR one, or the
		// runes in a plain `.svelte.ts` module never become reactive.
		conditions: ['browser']
	},
	test: {
		// Two suites: the pure-arithmetic tests kept in this repository, which run
		// without the private mount, and the external suite at `tests/` in the root
		// when the submodule is present. Local tests live here because the fold
		// rule's boundary cases must be checkable by anyone who changes it.
		include: ['tests/**/*.test.ts', '../tests/web/**/*.test.ts'],
		// Nothing under test touches the DOM; jsdom costs seconds per run for nothing.
		environment: 'node'
	}
});
