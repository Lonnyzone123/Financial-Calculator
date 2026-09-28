# -*- coding: utf-8 -*-
"""Ground-rule namespace scan, red-tested before any absence is believed.

A fourth namespace alongside tasks, close-out items and design decisions.
Nothing had ever checked it: eight cross-sprint ground-rule references exist
and no instrument had confirmed any of them resolve.

Controls follow the two requests from the review of tools/xref-scan.py:

  1. A control for the NUMBERED-LIST FORM specifically. Ground rules are
     '1.' '2.' list items, NOT '- [ ]' checkboxes. The first counter written
     for them used the checkbox pattern and reported ZERO ground rules in all
     eight sprints -- caught only by disbelief at an implausible zero. That is
     luck, not a check. FORM_SELFTEST makes it a check: a synthetic document
     whose rules are numbered must yield rules, and one whose "rules" are
     checkboxes must yield none. A checkbox-based regression fails here first.

  2. ADJACENCY absent-controls, one past each file's real count -- ('S102','13'),
     not ('S102','99'). A nonsense id tests whether the pattern matches
     EVERYTHING; it cannot catch an over-match onto one ADJACENT thing, which
     is what actually went wrong in the task extractor (close-out item 8 made
     'S6 task 8' resolve and hid three real dangling references).

Every control id was derived from the checklists by heading-form search, never
from this tool's own output: using a tool's result as its own control is the
circularity it exists to catch.

SCOPE, and it applies to tools/xref-scan.py identically. THE PRESENT CONTROLS
ENCODE HEAD'S COUNTS, so running this at a commit that predates a rule being
added produces a REFUSAL, not an answer. That is correct -- the tool genuinely
cannot validate itself against that tree -- but it makes this a HEAD-and-forward
instrument, not a historical one. Confirmed at 699e738^: 5 present controls
missed, S101 and S102 reporting zero rules, refusal fired.

MAINTENANCE: when a sprint gains or loses a ground rule, PRESENT and ABSENT both
need updating. That cost is the point, not a defect -- a control set that never
needs touching is one that stopped describing the corpus some time ago.
"""
import subprocess, re, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
COMMIT = sys.argv[1] if len(sys.argv) > 1 else 'HEAD'
NAMES = ['S4', 'S5', 'S5b', 'S6', 'S100', 'S101', 'S102', 'S103']

def get(f):
    return subprocess.check_output(
        ['git', 'show', '%s:%s_TASK_CHECKLIST.md' % (COMMIT, f)],
        text=True, encoding='utf-8', errors='replace')

# Heading may carry a suffix: '## Ground rules — **PRELIMINARY, added 2026-09-12**'
GR_HEAD = re.compile(r'^## +Ground rules\b', re.M | re.I)
NEXT_H2 = re.compile(r'^## ', re.M)
NUMBERED = re.compile(r'^(\d+)\.\s', re.M)

def ground_rules(t):
    m = GR_HEAD.search(t)
    if not m:
        return set()
    n = NEXT_H2.search(t, m.end())
    body = t[m.end():n.start() if n else len(t)]
    return set(NUMBERED.findall(body))

# ---- control 1: the FORM self-test, synthetic so the corpus cannot make it vacuous ----
FORM_OK   = "## Ground rules\n\nCarried from S4:\n\n1. First rule.\n2. Second rule.\n3. Third rule.\n\n## Next\n"
FORM_BAD  = "## Ground rules\n\n- [ ] 1. Looks like a rule, is a checkbox.\n- [ ] 2. Also a checkbox.\n\n## Next\n"
FORM_NONE = "## Tasks\n\n1. Not under a ground-rules heading.\n\n## Close-out\n"
form_fail = []
if ground_rules(FORM_OK) != {'1', '2', '3'}:
    form_fail.append('numbered form not extracted')
if ground_rules(FORM_BAD) != set():
    form_fail.append('checkbox form wrongly extracted as rules')
if ground_rules(FORM_NONE) != set():
    form_fail.append('numbered list outside the section wrongly extracted')

gr = {f: ground_rules(get(f)) for f in NAMES}
text = {f: get(f) for f in NAMES}

# ---- control 2: present in every file, plus adjacency absents one past each real count ----
# First AND last of every file's real range, plus extras. S6, S101 and S102
# previously had no rule-1 control, so an extractor that began matching partway
# down a section would still have passed for three of eight files.
PRESENT = [('S4','1'),('S4','9'),('S5','1'),('S5','10'),('S5b','1'),('S5b','10'),
           ('S6','1'),('S6','3'),('S6','8'),('S6','9'),('S6','10'),
           ('S100','1'),('S100','7'),('S101','1'),('S101','9'),('S101','10'),
           ('S102','1'),('S102','3'),('S102','4'),('S102','12'),
           ('S103','1'),('S103','6')]
ABSENT  = [('S4','10'),('S5','11'),('S5b','11'),('S6','11'),
           ('S100','8'),('S101','11'),('S102','13'),('S103','7')]

def classify(tgt, n, rules):
    """What a reference hit MEANS. Separate from finding it -- the two are
    different failure surfaces and the second needs its own control."""
    if tgt not in rules:
        return 'out-of-scope'      # not ours to validate; NOT a finding
    return 'ok' if n in rules[tgt] else 'dangling'


# ---- control 3: the CLASSIFIER, synthetic ----
# A reference to a sprint this tool does not read must be SKIPPED, never
# reported dangling. Without this the tool manufactures a finding from correct
# text -- the inverse of a vacuous pass: a check that cannot pass for the right
# reason. S104+ is already planned (S103 task 1.5 sequences work into it), so
# the first person to write "S104 ground rule 1" would have got a false finding.
_r = {'S6': {'1', '2'}}
class_fail = []
if classify('S104', '2', _r) != 'out-of-scope':
    class_fail.append('unknown sprint not skipped')
if classify('S6', '1', _r) != 'ok':
    class_fail.append('valid reference not accepted')
if classify('S6', '7', _r) != 'dangling':
    class_fail.append('genuinely dangling reference not reported')

# ---- COVERAGE ASSERTION: the only control here that maintains itself ----
# Every other list goes stale silently when a sprint gains or loses a rule.
# This one is derived from the corpus at run time, so it cannot drift from it.
# It does NOT check that the ids are right -- it checks that no FILE was left
# without controls, which is the failure mode found twice today: this tool's
# PRESENT covered 5 of 8 files, and xref-scan's close-out controls covered 2 of 8.
_ctl_files = sorted({f for f, _ in PRESENT})
_gr_files  = sorted([f for f in NAMES if gr[f]])
cover_fail = ([] if _ctl_files == _gr_files else
              ['control files %s != files with ground rules %s' % (_ctl_files, _gr_files)])

missed = [(f,i) for f,i in PRESENT if i not in gr[f]]
false_pos = [(f,i) for f,i in ABSENT if i in gr[f]]

print('=== RED TEST ===')
print('form self-test (synthetic): %s' % ('PASS' if not form_fail else 'FAIL ' + '; '.join(form_fail)))
print('known-present: %d, found %d, MISSED %d %s' % (len(PRESENT), len(PRESENT)-len(missed), len(missed), missed or ''))
print('adjacency-absent: %d, correctly absent %d, FALSE POSITIVES %d %s'
      % (len(ABSENT), len(ABSENT)-len(false_pos), len(false_pos), false_pos or ''))
print('classifier self-test (synthetic): %s'
      % ('PASS' if not class_fail else 'FAIL ' + '; '.join(class_fail)))
print('coverage: %s' % ('OK -- every file with ground rules has controls'
                        if not cover_fail else 'FAIL ' + '; '.join(cover_fail)))
print()
print('=== GROUND RULES PER FILE (the denominator) ===')
for f in NAMES:
    ids = sorted(gr[f], key=int)
    print('  %-5s %2d : %s' % (f, len(gr[f]), ','.join(ids) if ids else 'NONE'))
print()

if form_fail or class_fail or cover_fail or missed or false_pos:
    print('!!! NOT VALIDATED - ABSENCES NOT REPORTED. Fix the extractor first.')
    print('TERMINATOR ok')
    sys.exit(0)

# ---- the scan ----
REF = re.compile(r'\bS(\d+b?)(?:’s|\'s)?(?: own)?[^.\n]{0,12}?ground[- ]rule[- ]?(\d+)', re.I)
print('=== CROSS-SPRINT GROUND-RULE REFERENCES ===')
bad = 0
total = 0
skipped = []
for f, t in text.items():
    for m in REF.finditer(t):
        tgt, n = 'S' + m.group(1), m.group(2)
        verdict = classify(tgt, n, gr)
        if verdict == 'out-of-scope':
            skipped.append((f, tgt, n))
            continue
        total += 1
        ok = verdict == 'ok'
        if not ok:
            bad += 1
            a = max(0, m.start()-70)
            print('  %-5s -> %-5s gr%-3s *** DANGLING *** ...%s...' % (f, tgt, n, t[a:m.end()+40].replace('\n',' ')))
        else:
            print('  %-5s -> %-5s gr%-3s OK' % (f, tgt, n))
print()
if skipped:
    print()
    print('SKIPPED, target outside this tool\'s scope -- counted, never silent:')
    for f, tgt, n in skipped:
        print('  %-5s -> %-5s gr%-3s (no %s checklist is read by this tool)' % (f, tgt, n, tgt))
print('references scanned: %d | DANGLING: %d | skipped out-of-scope: %d'
      % (total, bad, len(skipped)))
print('TERMINATOR ok')
