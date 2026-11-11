/**
 * What the host-backed capabilities are, and which of them this host mounted.
 *
 * A leaf module, deliberately: `prompt.ts` needs `SKILL_NAME` from `skill.ts`, so if `skill.ts`
 * imported a *value* from `prompt.ts` the two would evaluate in a cycle and whichever loaded
 * second would read the other's binding before it existed. Shuffled test orders made that visible
 * as `Cannot access 'SKILL_NAME' before initialization`. Anything both halves need lives here.
 */
export type Capabilities = { fs: boolean; ai: boolean; exec: boolean; web: boolean };

/**
 * Omitted means "assume nothing is mounted", which is the safe direction: under-describing a
 * registered route costs the model a capability it could have used, while describing an
 * UNregistered one produces cards whose import fails — and a failed import takes the whole module
 * down. The host passes what it actually mounted; nothing here guesses.
 */
export const DEFAULT_CAPABILITIES: Capabilities = { fs: false, ai: false, exec: false, web: false };
