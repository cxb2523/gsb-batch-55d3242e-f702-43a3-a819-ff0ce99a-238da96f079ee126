#!/usr/bin/env bash
# Builds a workspace for `eval.sh` to run a prompt inside.
#
# `test/eval-fixtures.md` says to run the fixtures against real files, and several prompts are
# meaningless without them — `这个项目的 git 历史帮我梳理一下` in an empty directory sends the model
# hunting for *some* repository (measured: 19 to 35 bash calls, then prose about whatever it found).
# The seeds are generated rather than committed because one of them is a git repository, and a
# repository inside a repository is not something git will carry.
#
# Usage: scripts/make-seed.sh <kind> [dir]   — kinds: git, diff, env, src
set -eu
kind=${1:?usage: make-seed.sh <git|diff|env|src> [dir]}
dir=${2:-/tmp/dsh-seed-$kind}
rm -rf "$dir"
mkdir -p "$dir"

case "$kind" in
  git)
    git -C "$dir" init -q
    git -C "$dir" config user.email fixture@example.com
    git -C "$dir" config user.name Fixture
    # Enough history that summarising it loses something: 24 commits, three authors, several files,
    # and a mix of feature/fix/refactor subjects. Six commits to one file — the first version of
    # this seed — is a history a paragraph genuinely covers, so it measured the wrong thing.
    mkdir -p "$dir/src" "$dir/docs"
    authors=("Ada Lovelace|ada@example.com" "Grace Hopper|grace@example.com" "Alan Turing|alan@example.com")
    names=(
      parseGroup parseAtom parseQuantifier parseAlternation parseClass parseEscape
      parseAnchor parseBackref parseNamedGroup parseLookahead parseRange parseLiteral
    )
    subjects=(
      "add the parser skeleton" "fix off-by-one in the tokenizer" "extract the lexer"
      "handle empty input" "document the grammar" "speed up the hot loop"
      "drop the unused flag" "rename Node to Expr" "cover the error path"
      "fix a crash on nested groups" "tidy the imports" "add a benchmark"
    )
    n=0
    for month in 1 2 3 4 5 6; do
      for day in 04 11 18 25; do
        who=${authors[$((n % 3))]}
        subj=${subjects[$((n % 12))]}
        # The lines have to look like code. An earlier version appended `change 0`…`change 23`, and
        # all three runs of the history fixture spotted it — "这是合成测试项目：文件内容全是占位符" —
        # and answered about the fixture instead of building anything. A seed whose contents announce
        # that they are a seed measures the model noticing, not the rule.
        name=${names[$((n % 12))]}
        if [ "$n" -lt 12 ]; then
          printf 'export const %s = (t: Token) => t.kind === "%s";\n' "$name" "${name#parse}" >> "$dir/src/parser.ts"
        else
          # The second pass EDITS what the first pass wrote. Appending a second `export const` of the
          # same name is not something a repository ever contains, and 24 appended lines with no
          # deletions is its own tell — a real history revises.
          perl -pi -e "s/^export const $name = .*/export const $name = (t: Token) => t.kind === \"${name#parse}\" \&\& t.span.end > t.span.start;/" "$dir/src/parser.ts"
        fi
        # Same shape for the other two files: write on the first pass, revise on the second.
        if [ $((n % 3)) -eq 0 ]; then
          if [ "$n" -lt 12 ]; then printf -- '- `%s` accepts a bare symbol, and returns null on EOF.\n' "$name" >> "$dir/docs/notes.md"
          else perl -pi -e "s/^- \\\`$name\\\` .*/- \\\`$name\\\` accepts a bare symbol; nested groups recurse./" "$dir/docs/notes.md"; fi
        fi
        if [ $((n % 4)) -eq 0 ]; then
          sym=$(echo "${name#parse}" | tr "a-z" "A-Z")
          if [ "$n" -lt 12 ]; then printf 'export const %s = /^[a-z_][a-z0-9_]*$/;\n' "$sym" >> "$dir/src/lexer.ts"
          else perl -pi -e "s|^export const $sym = .*|export const $sym = /^[a-z_][a-z0-9_-]*\\\$/u;|" "$dir/src/lexer.ts"; fi
        fi
        git -C "$dir" add -A
        GIT_AUTHOR_NAME="${who%%|*}" GIT_AUTHOR_EMAIL="${who##*|}" \
        GIT_COMMITTER_NAME="${who%%|*}" GIT_COMMITTER_EMAIL="${who##*|}" \
        GIT_AUTHOR_DATE="2026-0$month-${day}T1${day:0:1}:00:00" GIT_COMMITTER_DATE="2026-0$month-${day}T1${day:0:1}:00:00" \
          git -C "$dir" commit -qm "$subj"
        n=$((n + 1))
      done
    done
    ;;
  diff)
    # A working tree with UNCOMMITTED changes, which the `git` seed deliberately does not have.
    # The resident layer names `git log` ("最近改了啥, 梳理一下 git 历史") and never says `diff`,
    # and a real session went 12 bash calls deep reading a diff before answering in markdown —
    # so the question of whether the browse rule reaches `帮我看看 diff 都是些啥` needs a fixture
    # where there is a diff to read.
    "$0" git "$dir" >/dev/null
    # Spread across several files and both directions, so summarising it loses something: a
    # one-file one-hunk diff really is fine as prose and would measure the wrong thing.
    perl -pi -e 's/^export const parseAtom = .*/export const parseAtom = (t: Token) => t.kind === "Atom" \&\& !t.synthetic;/' "$dir/src/parser.ts"
    perl -pi -e 's/^export const parseRange = .*/export const parseRange = (t: Token) => t.kind === "Range" \&\& t.span.end > t.span.start \&\& t.lo <= t.hi;/' "$dir/src/parser.ts"
    perl -pi -e 's|^export const GROUP = .*|export const GROUP = /^[a-z_][a-z0-9_.-]*$/iu;|' "$dir/src/lexer.ts" 2>/dev/null || true
    printf -- '- `parseAtom` no longer accepts synthetic tokens.\n' >> "$dir/docs/notes.md"
    printf 'export const VERSION = "2.0.0";\n' > "$dir/src/version.ts"
    mkdir -p "$dir/bench"
    printf 'run("parse", () => parse(SAMPLE));\n' > "$dir/bench/parse.bench.ts"
    ;;
  env)
    cat > "$dir/.env" <<'ENV'
DATABASE_URL=postgres://localhost:5432/app
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
FEATURE_NEW_CHECKOUT=false
SESSION_TTL_SECONDS=3600
ENV
    printf '.env\nnode_modules\n' > "$dir/.gitignore"
    ;;
  src)
    mkdir -p "$dir/src/components" "$dir/src/lib"
    printf 'export function App() { return null }\n' > "$dir/src/App.tsx"
    printf 'export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))\n' > "$dir/src/lib/clamp.ts"
    printf 'export function Button() { return null }\n' > "$dir/src/components/Button.tsx"
    printf '# app\n\nA small thing.\n' > "$dir/README.md"
    ;;
  *) echo "unknown kind: $kind" >&2; exit 2 ;;
esac

echo "$dir"
