#!/usr/bin/env sh
# Runs inside the throwaway copy, after `cp -R`. Anything a prompt needs that cannot be a
# checked-in file goes here — a `.git` directory checked into this repo would nest.
set -e
git init -q .
git config user.email fixture@example.com
git config user.name Fixture
git add -A && git commit -qm 'initial import'
printf 'export const parse = (s: string) => JSON.parse(s.trim());\n' > src/lib/parse.ts
git commit -qam 'trim before parsing'
printf 'export function Card({ title }: { title: string }) { return null; }\n' > src/components/Card.tsx
git commit -qam 'give Card a title'
