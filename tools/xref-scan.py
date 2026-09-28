# -*- coding: utf-8 -*-
"""Cross-sprint reference scan, with the extractor red-tested before any absence is believed.

Sixth standing check: an absence is evidence only once the instrument has been
shown capable of producing a presence. So this script REFUSES TO REPORT
dangling references unless every known-present control is found first, and
unless a known-absent control is correctly reported missing.

THE LIMITATION THIS SHIPPED WITH, NOW FIXED, AND WHAT IT COST. The first version
let CHECKBOX match CLOSE-OUT item numbering, which uses the same '- [ ] 7.' form
as a subtask. S5b defines five tasks and the tool reported eleven ids. That did
not produce noise, IT PRODUCED FALSE CONFIDENCE: three real dangling references
to a nonexistent 'S6 task 8' resolved against S6's close-out item 8 and were
reported clean. Run this file at 3efba77^ to watch the fixed version find all
three where the previous one found none.

THREE FAILURE SURFACES, each needing its own known-present case:
  1. the EXTRACTOR      -- does it find definitions that exist
  2. the CLASSIFIER     -- does it decide correctly what a hit means
  3. THE DEFINITION OF WHAT COUNTS AS A DEFINITION -- upstream of both, and the
     one that failed. 'S6 task 99' tests whether the extractor matches
     EVERYTHING. It cannot catch an over-match onto one ADJACENT thing, so the
     ABSENT list now carries adjacency controls -- ('S5b','5'/'7'/'10') for
     close-out items, and ('S6','8') for the exact id that cost three references.

CLOSE-OUT ITEMS GET THEIR OWN NAMESPACE RATHER THAN EXCLUSION. Excluding a thing
from one namespace is not the same as deciding it does not exist: S5 legitimately
cites 'S5b close-out 3/6/7', and bare exclusion would have made those three
dangle -- a fix manufacturing the defect class it was repairing.

THAT RESIDUAL IS NOW CLOSED, and this paragraph is the second correction to
this docstring for the same reason. The previous version said 'Exit gate' was
NOT in the list and was harmless only because its items are lettered -- true
when written, FALSE from 733b18e, which added it. A docstring describing a state
the code no longer has is the same defect this file exists to catch, and it was
left standing in the very commit whose message warned about it.

'Exit gate' is in NON_TASK_NAMES, the names are data rather than an inline
alternation, and a synthetic self-test proves the blanking works for EVERY name
in that list -- so a misspelled entry, which would otherwise match nothing and
look exactly like a working patch, now fails the red test.

WHAT IS STILL TRUE: the list is finite and hand-maintained. A non-task section
with a NEW name, introduced later and numbering its items '- [ ] 1.', re-opens
the hole. ADD IT TO NON_TASK_NAMES AND ADD AN ADJACENCY CONTROL TO ABSENT IN THE
SAME EDIT.

SCOPE, and tools/groundrule-scan.py has this property identically. THE CONTROLS
ENCODE HEAD'S IDS, so running at a commit predating a task's existence produces
a REFUSAL rather than an answer. That is correct -- the tool cannot validate
itself against that tree -- but it makes this a HEAD-and-forward instrument, not
a historical one. Passing an old commit to compare eras will refuse, not answer.
"""
import subprocess, re, io, sys, collections
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Commit to scan. Defaults to HEAD -- a hardcoded commit makes this tool report
# on a fixed past, which is the exact staleness class it exists to help find.
COMMIT = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
NAMES = ['S4', 'S5', 'S5b', 'S6', 'S100', 'S101', 'S102', 'S103']

def get(f):
    return subprocess.check_output(['git', 'show', '%s:%s_TASK_CHECKLIST.md' % (COMMIT, f)],
                                   text=True, encoding='utf-8', errors='replace')

text = {f: get(f) for f in NAMES}

# ---- definition extraction: all four heading forms plus checkbox subtasks ----
HEAD_TASK = re.compile(r'^#+\s+Task\s+(\d+[a-z]*)\b', re.M)          # '## Task 2b — ...'
HEAD_BARE = re.compile(r'^#+\s+(\d+[a-z]*)\s*[.—–-]', re.M) # '### 1b.' / '### 2b —' / '### 1.'
CHECKBOX  = re.compile(r'^- \[[ x]\]\s+\*{0,2}(\d+[a-z]*(?:\.\d+[a-z]*)?)', re.M)

# A THIRD failure surface, found by df at a967707: deciding what counts as a
# definition, upstream of both finding hits and classifying them. Ground rules,
# stopping points and close-out items use the SAME '- [ ] 7.' form as a subtask,
# so they registered as task definitions. S5b defines five tasks and the tool
# reported eleven; 'S5b task 5' through 'task 10' would have resolved silently —
# an over-match the ABSENT controls could not catch, because 'S6 task 99' tests
# for matching EVERYTHING, not for matching one ADJACENT thing.
# Listed as data so the self-test below can iterate it. 'Exit gate' is here on
# 84's catch: it is a section in SIX files (S4, S5, S5b, S101, S102, S103) and
# every one happens to letter its items E1/E2 rather than numbering them. That
# convention is written down nowhere, so the tool was correct by someone else's
# instinct rather than by construction. A numbered exit-gate item added by
# anyone, any day, would have re-opened the exact hole this file just closed.
NON_TASK_NAMES = ('Ground rules', 'Stopping points', 'Close-out', 'Handover', 'Exit gate')
NON_TASK_SECTION = re.compile(r'^## +(?:' + '|'.join(NON_TASK_NAMES) + r')\b', re.M | re.I)
NEXT_H2 = re.compile(r'^## ', re.M)

def task_region_only(t):
    """Blank out every non-task section, each running to the next '## ' heading."""
    spans = []
    for m in NON_TASK_SECTION.finditer(t):
        nxt = NEXT_H2.search(t, m.end())
        spans.append((m.start(), nxt.start() if nxt else len(t)))
    if not spans:
        return t
    out, prev = [], 0
    for a, b in spans:
        out.append(t[prev:a])
        out.append(re.sub(r'[^\n]', ' ', t[a:b]))   # keep line structure, kill content
        prev = b
    out.append(t[prev:])
    return ''.join(out)

def definitions(t):
    ids = set()
    tasks_only = task_region_only(t)
    for rx in (HEAD_TASK, HEAD_BARE, CHECKBOX):
        for m in rx.finditer(tasks_only):
            ids.add(m.group(1))
    return ids

CLOSEOUT_HEAD = re.compile(r'^## +Close-out\b', re.M | re.I)

def closeout_ids(t):
    """Close-out items are real referents ('S5b close-out 6') but are NOT tasks.
    Excluding them from definitions (above) is correct; checking close-out
    references against task ids is not. They need their own namespace."""
    m = CLOSEOUT_HEAD.search(t)
    if not m:
        return set()
    nxt = NEXT_H2.search(t, m.end())
    body = t[m.end():nxt.start() if nxt else len(t)]
    return set(CHECKBOX.findall(body))

defined = {f: definitions(text[f]) for f in NAMES}
closeouts = {f: closeout_ids(text[f]) for f in NAMES}

# ---- FIFTH NAMESPACE: exit-gate items -------------------------------------
# Exit-gate items are LETTERED (E1, E2...) by convention, which is exactly why
# nothing checked them: REF expected a digit-initial id, and 'exit gate' was not
# in its keyword list, so 'S100 exit gate E2' was checked by NOTHING. There are
# zero such references in the corpus today, which makes this the S104-ground-rule
# shape -- latent, not broken: the FIRST citation would have gone unchecked while
# both tools reported clean. The lettering convention is what makes the namespace
# permanent rather than incidental, so it is covered before it is used.
#
# Seven files have an exit gate; S6 deliberately does NOT -- its closure verdict
# is close-out item 7. ('S6','E1') is an absent-control for exactly that: the
# empty case must resolve to nothing rather than to an error.
EXITGATE_HEAD = re.compile(r'^## +Exit gate\b', re.M | re.I)
EG_ITEM = re.compile(r'^- \[[ x]\]\s+\*{0,2}([A-Z]\d+)\b', re.M)

def exitgate_ids(t):
    m = EXITGATE_HEAD.search(t)
    if not m:
        return set()
    n = NEXT_H2.search(t, m.end())
    body = t[m.end():n.start() if n else len(t)]
    return set(EG_ITEM.findall(body))

exitgates = {f: exitgate_ids(text[f]) for f in NAMES}

# ---- RED TEST: known-present controls must ALL be found ----
PRESENT = [('S6','1'),('S6','1b'),('S6','2'),('S6','3'),('S6','4'),('S6','4b'),('S6','5'),
           ('S6','6'),('S6','7'),('S6','7.6'),('S6','3.9'),('S6','6.9'),
           ('S5','1'),('S5','2'),('S5','2b'),('S5','2c'),('S5','2d'),
           ('S5b','1'),('S5b','2'),('S5b','2b'),('S5b','3'),('S5b','4'),
           ('S103','1'),('S103','9'),('S103','9.1'),
           # Every file gets at least one control. Four had none, so the
           # section-blanking could have swallowed a whole file's tasks and
           # the red test would still have passed. Ids derived from the files.
           ('S4','0'),('S4','2b'),('S4','10'),('S5','2g'),('S5','13'),
           ('S100','6'),('S101','5'),('S102','7'),('S103','15')]
ABSENT  = [('S6','99'),('S5b','77'),('S103','404'),
           # Adjacency controls: an id one step outside each file's real range.
           # ('S6','8') is the id that cost three references -- if a future
           # broadening makes it resolve again, this red test fails loudly.
           ('S5b','5'),('S5b','7'),('S5b','10'),('S6','8'),
           # ('S103','13') moved to PRESENT 2026-09-13: task 13 (Q45's
           # calibrated-correlation-matrix deferral) landed for real, on a
           # report from investment-calculator-84 that S103's own task 1.6
           # sweep had missed it.
           # ('S103','14') moved to PRESENT 2026-09-14: task 14 (itemization)
           # landed the same way, on a report from investment-calculator-4c.
           # ('S103','15') moved to PRESENT 2026-09-14: task 15 (account-rules
           # vectors) landed the same day, same reporter.
           # The adjacency control follows the real range, one step past the
           # new last id.
           ('S4','11'),('S100','7'),('S101','6'),('S102','8'),('S103','16')]

# The close-out extractor is a SEPARATE INSTRUMENT and gets its own red test.
# Every other extractor here refuses to report absences without controls; this
# one would otherwise report RESOLUTIONS without any. CO_PRESENT deliberately
# includes ('S5b','1') and ('S5b','10'), which NOTHING CITES -- a control set
# built only from ids known to be referenced encodes the answer it is checking.
# ('S5b','2b') is the adjacency control: 2b is a real TASK and not a close-out
# item, so it proves the two namespaces are distinct rather than one being a
# superset of the other. All six verified against the files, not against this
# tool's own output.
# Extended after the coverage assertion caught that controls covered 2 of 8
# files. Ids derived from the checklists by independent search, never from
# this tool's output. First and last of each file's range -- and that
# description was checked against the list, not asserted of it.
CO_PRESENT = [('S4','1'),('S4','12'),('S5','1'),('S5','17'),
              ('S5b','1'),('S5b','3'),('S5b','6'),('S5b','7'),('S5b','10'),
              ('S6','1'),('S6','8'),('S100','1'),('S100','8'),
              ('S101','1'),('S101','5'),('S102','1'),('S102','7'),
              ('S103','1'),('S103','8')]
# Adjacency, one past each file's real range -- not ('S4','99').
# ('S5b','2b') is a real TASK id: it proves the namespaces are distinct.
CO_ABSENT  = [('S4','13'),('S5','18'),('S5b','11'),('S6','9'),
              ('S100','9'),('S101','6'),('S102','8'),('S103','9'),
              ('S5b','2b'),('S5b','99')]

co_missed = [(f,i) for f,i in CO_PRESENT if i not in closeouts[f]]
co_false  = [(f,i) for f,i in CO_ABSENT  if i in closeouts[f]]

# ---- RED TEST OF THE BLANKING STAGE ITSELF ----
# The corpus cannot supply a control here: no non-task section currently
# CONTAINS a numbered item, so at HEAD this stage is a no-op, and a corpus-based
# control would pass whether or not it works. So the control is synthetic, and
# it is a known-present case in the strict sense: an input where the blanking
# MUST change the answer. It also catches a typo in any NON_TASK_NAMES entry,
# which a silently-non-matching section name would otherwise hide forever.
blank_fail = []
for _name in NON_TASK_NAMES:
    _doc = '## Tasks\n- [ ] 1. real task\n\n## %s\n- [ ] 7. NOT a task\n' % _name
    _ids = definitions(_doc)
    if '1' not in _ids:
        blank_fail.append((_name, 'blanked a REAL task'))
    if '7' in _ids:
        blank_fail.append((_name, 'did NOT blank the section'))
_ctl = definitions('## Tasks\n- [ ] 1. real task\n- [ ] 7. also real\n')
if '7' not in _ctl:
    blank_fail.append(('(control)', 'blanking fired OUTSIDE a non-task section'))

missed = [(f, i) for f, i in PRESENT if i not in defined[f]]
false_pos = [(f, i) for f, i in ABSENT if i in defined[f]]

print('=== RED TEST OF THE EXTRACTOR ===')
print('known-present controls: %d, found %d, MISSED %d' % (len(PRESENT), len(PRESENT)-len(missed), len(missed)))
if missed: print('  MISSED:', missed)
print('known-absent controls:  %d, correctly absent %d, FALSE POSITIVES %d'
      % (len(ABSENT), len(ABSENT)-len(false_pos), len(false_pos)))
if false_pos: print('  FALSE POSITIVES:', false_pos)
print('close-out present controls: %d, found %d, MISSED %d'
      % (len(CO_PRESENT), len(CO_PRESENT)-len(co_missed), len(co_missed)))
if co_missed: print('  MISSED:', co_missed)
print('close-out absent controls:  %d, correctly absent %d, FALSE POSITIVES %d'
      % (len(CO_ABSENT), len(CO_ABSENT)-len(co_false), len(co_false)))
if co_false: print('  FALSE POSITIVES:', co_false)
print('section-blanking controls:  %d sections x2 plus 1 outside-control, FAILURES %d'
      % (len(NON_TASK_NAMES), len(blank_fail)))
if blank_fail: print('  FAILURES:', blank_fail)
print()
print('=== DEFINITIONS FOUND PER FILE (the denominator) ===')
for f in NAMES:
    tops = sorted([i for i in defined[f] if '.' not in i], key=lambda s: (int(re.match(r'\d+',s).group()), s))
    print('  %-5s %3d ids | top-level: %s' % (f, len(defined[f]), ' '.join(tops)))
print()

# ---- exit-gate red test ----------------------------------------------------
# EG_PRESENT covers ALL SEVEN files that have a gate, first and last of each
# range -- and the description was checked against the list rather than asserted
# of it, which is how three files ended up with no rule-1 control last time.
EG_PRESENT = [('S4','E1'),('S4','E8'),('S5','E1'),('S5','E8'),('S5b','E1'),('S5b','E9'),
              ('S100','E1'),('S100','E7'),('S101','E1'),('S101','E8'),
              ('S102','E1'),('S102','E9'),('S103','E1'),('S103','E7')]
# Adjacency, one past each real count -- not ('S4','E99'), which would only test
# whether the pattern matches everything. Plus ('S6','E1'): S6 has no gate at
# all, so the empty case must come back empty. Plus ('S5b','2b'): a real TASK id,
# proving the namespaces are DISTINCT rather than one being a superset.
EG_ABSENT = [('S4','E9'),('S5','E9'),('S5b','E10'),('S100','E8'),('S101','E9'),
             ('S102','E10'),('S103','E8'),('S6','E1'),('S5b','2b')]

# The REFERENCE half is empty in the corpus (nothing cites an exit-gate item
# yet), so a corpus-based control over it would pass whether or not the
# classifier works -- vacuous, the defect this sequence began with. Synthetic
# instead: the machinery is proved on invented references while the real set
# stays honestly empty. This is what lets coverage exist BEFORE the first
# citation rather than arriving after the first unchecked one.
# ONE definition, used by BOTH the synthetic self-test below and the real
# scan. It was two identical copies kept in step by hand. A self-test that
# exercises a COPY of the pattern proves the copy works. Q20/Q33/Q38 is this
# exact shape and the project has paid for it four times; it does not get a
# fifth inside the file that hunts it.
REF = re.compile(r'\bS(\d+b?)\s+(task|design decision|close-out|decision|exit gate)\s+\*{0,2}([A-Za-z]?\d+[a-z]*(?:\.\d+[a-z]*)?)', re.I)
def _resolve(line, pools):
    out = []
    for m in REF.finditer(line):
        tgt, kind, ref = 'S' + m.group(1), m.group(2).lower(), m.group(3)
        if tgt not in pools:
            out.append('skip'); continue
        pool = pools[tgt]['eg'] if kind == 'exit gate' else pools[tgt]['task']
        r = ref.upper() if kind == 'exit gate' else ref
        out.append('ok' if (r in pool or r.split('.')[0] in pool) else 'dangling')
    return out

_pools = {'S100': {'eg': {'E1','E2','E7'}, 'task': {'1','5'}},
          'S6':   {'eg': set(),            'task': {'7'}}}
eg_ref_fail = []
if _resolve('see S100 exit gate E2 for the oracle', _pools) != ['ok']:
    eg_ref_fail.append('a valid exit-gate reference did not resolve')
if _resolve('see S100 exit gate E9 for the oracle', _pools) != ['dangling']:
    eg_ref_fail.append('an invalid exit-gate reference was not reported dangling')
if _resolve('see S6 exit gate E1 for the verdict', _pools) != ['dangling']:
    eg_ref_fail.append('a reference into a file with NO gate did not dangle')
if _resolve('see S104 exit gate E1 for later', _pools) != ['skip']:
    eg_ref_fail.append('an out-of-scope sprint was not skipped')
if _resolve('see S100 task 5 and S100 exit gate E1', _pools) != ['ok','ok']:
    eg_ref_fail.append('task and exit-gate namespaces not routed separately')
if _resolve('see S100 exit gate 5', _pools) != ['dangling']:
    eg_ref_fail.append('a task id cited as an exit-gate item did not dangle')

eg_missed = [(f,i) for f,i in EG_PRESENT if i not in exitgates[f]]
eg_false  = [(f,i) for f,i in EG_ABSENT  if i in exitgates[f]]

# ---- COVERAGE ASSERTIONS: the only controls that maintain themselves ---------
# Every other control here is a hand-maintained list that goes stale SILENTLY
# when a sprint gains an item -- four such lists across two tools. A coverage
# assertion is different in kind: it is derived from the corpus at run time, so
# it cannot drift from it. It does not check that the ids are right; it checks
# that no FILE was left without controls, which is the failure that let three
# files pass with no rule-1 control and could let section-blanking swallow an
# entire file's tasks while the red test stayed green.
def coverage(label, control_pairs, pools):
    have = sorted({f for f, _ in control_pairs})
    real = sorted([f for f in NAMES if pools[f]])
    return [] if have == real else ['%s: control files %s != files with %s %s' % (label, have, label, real)]

eg_cover   = coverage('an exit gate', EG_PRESENT, exitgates)
task_cover = coverage('tasks', PRESENT, defined)
co_cover   = coverage('a close-out', CO_PRESENT, closeouts)

print('exit-gate reference self-test (synthetic): %s' % ('PASS' if not eg_ref_fail else 'FAIL ' + '; '.join(eg_ref_fail)))
print('exit-gate present controls: %d, found %d, MISSED %d %s'
      % (len(EG_PRESENT), len(EG_PRESENT)-len(eg_missed), len(eg_missed), eg_missed or ''))
print('exit-gate absent controls:  %d, correctly absent %d, FALSE POSITIVES %d %s'
      % (len(EG_ABSENT), len(EG_ABSENT)-len(eg_false), len(eg_false), eg_false or ''))
print('coverage: tasks %s | close-out %s | exit-gate %s'
      % ('OK' if not task_cover else 'FAIL', 'OK' if not co_cover else 'FAIL', 'OK' if not eg_cover else 'FAIL'))
for _c in (task_cover + co_cover + eg_cover):
    print('   ' + _c)
print('exit-gate control coverage: %s' % ('every file with a gate has controls' if not eg_cover else 'FAIL ' + eg_cover[0]))
print('exit-gate ids per file: %s' % ' '.join('%s=%d' % (f, len(exitgates[f])) for f in NAMES))

if missed or false_pos or co_missed or co_false or blank_fail or eg_missed or eg_false or eg_cover or eg_ref_fail or task_cover or co_cover:
    print('!!! EXTRACTOR NOT VALIDATED — ABSENCES NOT REPORTED. Fix the pattern first.')
    print('TERMINATOR ok')
    sys.exit(0)

# ---- the scan proper ----
# REF is defined ABOVE, before the self-test that exercises it. Do not
# redefine it here: the self-test would then validate a pattern the scan
# does not use, which is the defect this comment replaced.
MAPTABLE  = re.compile(r'\|\s*\*{0,2}S\d+b?\s+task', re.I)   # a move-table cell, '**' and all
OLD_PROSE = re.compile(r'\bthe old S\d+b?\s+task', re.I)     # prose that self-labels as old

total = 0
skipped = 0
per_kind = {}
dangling = []
for f, t in text.items():
    lines = t.split('\n')
    for ln, line in enumerate(lines, 1):
        in_map = bool(MAPTABLE.search(line)) or bool(OLD_PROSE.search(line))
        for m in REF.finditer(line):
            tgt, kind, ref = 'S' + m.group(1), m.group(2).lower(), m.group(3)
            total += 1
            per_kind[kind] = per_kind.get(kind, 0) + 1
            if tgt not in defined:
                skipped += 1          # out of scope: skipped AND counted, never dropped
                continue
            if kind == 'exit gate':
                pool = exitgates[tgt]
                ref = ref.upper()
            elif kind == 'close-out':
                pool = closeouts[tgt]
            else:
                pool = defined[tgt]
            base = ref.split('.')[0]
            if ref not in pool and base not in pool:
                dangling.append((f, ln, tgt, ref, in_map, line.strip()[:90]))

print('=== SCAN RESULT ===')
print('cross-sprint references scanned: %d' % total)
print('dangling: %d' % len(dangling))
for f, ln, tgt, ref, in_map, snip in dangling:
    print('  %-5s L%-4d -> %-5s %-6s %s' % (f, ln, tgt, ref, 'OLD-ID MAP TABLE (reports, not asserts)' if in_map else '*** LIVE REFERENCE ***'))
    if not in_map:
        print('        %s' % snip)
live = [d for d in dangling if not d[4]]
print()
print('by kind: %s | out-of-scope skipped: %d' %
      (', '.join('%s=%d' % (k, n) for k, n in sorted(per_kind.items())) or 'none', skipped))
print('LIVE dangling references (the only ones that are findings): %d' % len(live))

# ---- the exit-gate reference half must not report a pass over an empty set ----
# 'dangling: 0' across zero references is ST2-02 in a new costume: a gate
# certifying an empty sweep, which is the defect this whole sequence started
# from. The EXTRACTOR half is not vacuous -- there are real E-ids to find and
# controls that prove the tool can see them. The REFERENCE half is genuinely
# empty and has to SAY SO rather than print a clean verdict.
eg_refs = per_kind.get('exit gate', 0)
print()
if eg_refs == 0:
    print('exit-gate references: 0 — EMPTY SET, NOT A PASS.')
    print('  The extractor half IS validated: %d exit-gate ids found across %d files, '
          'with present/absent controls.' % (sum(len(v) for v in exitgates.values()),
                                             len([f for f in NAMES if exitgates[f]])))
    print('  The reference half checked nothing, because nothing cites an exit-gate item yet.')
    print('  Coverage exists BEFORE the first citation, deliberately; it is not evidence of correctness.')
else:
    print('exit-gate references: %d, checked against the exit-gate namespace.' % eg_refs)
print('TERMINATOR ok')
