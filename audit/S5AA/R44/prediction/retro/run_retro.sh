#!/bin/sh
# S5AA R44 (R43-04): run each corrected R43 scan on its part's pre-repair tree, in a clean worktree, and write its output here.
# Usage (from the repository root): sh audit/S5AA/R44/prediction/retro/run_retro.sh
# Then: node audit/S5AA/R44/prediction/retro/compare_retro.js
D=audit/S5AA/R44/prediction/retro
WT=C:/fc-wt-r44retro
run() { # scan commit
  git worktree add --detach "$WT" "$2" >/dev/null 2>&1 || { echo "worktree failed at $2"; exit 2; }
  cmd //c mklink //J "C:\\fc-wt-r44retro\\node_modules" "C:\\Financial-Calculator\\node_modules" >/dev/null
  node "$D/$1_corpus_scan_v2.js" "$WT" > "$D/$1_corpus_scan_v2_at_$2.txt" 2>&1; echo "$1 at $2: exit $? -- $(tail -1 "$D/$1_corpus_scan_v2_at_$2.txt" | cut -c1-120)"
  cmd //c rmdir "C:\\fc-wt-r44retro\\node_modules"
  git worktree remove --force "$WT"
}
run tax d11017f
run contrib b131aeb
run life dd18f31
run flows 960eb11
