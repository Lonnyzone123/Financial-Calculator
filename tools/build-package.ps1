# Build an external-review package: a zip of the repository's TRACKED files
# plus a SHA256 manifest, and a .sha256 sidecar for the zip itself.
#
# WHY THIS EXISTS AS A SCRIPT. Every previous package was assembled ad hoc, and
# that produced two defects worth not repeating:
#
#   * Compress-Archive wrote entry paths with BACKSLASH separators, which are
#     not valid zip entry names and which some extractors render as one long
#     filename. Entries here are written with explicit '/' via ZipArchive.
#   * The manifest hashed ITSELF while being written, so its own line could
#     never be correct. It is excluded from its own manifest, and the exclusion
#     is stated in the file.
#
# WHAT GOES IN. `git ls-files` -- tracked files only -- minus '*.zip.sha256'.
# That is the exact rule the 2026-09-11 package used, recovered by diffing it
# against the tree it was cut from rather than assumed. Tracked-only matters:
# it means the package is reproducible from a commit, and that node_modules,
# scratch files and the off-git engineering log cannot leak in.
#
# WHAT IS DELIBERATELY NOT IN. Untracked files -- including any reference doc
# still being drafted -- and ENGINEERING_LOG.md, which is off-git by design.
# The script REPORTS untracked files rather than silently skipping them, so
# "it wasn't in the package" is never a surprise.
#
# Usage:  pwsh -File tools/build-package.ps1 -Name REAUDIT_PACKAGE_2_20260910

param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$RepoRoot = 'C:\Calculator merge'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Set-Location $RepoRoot

# --- 0. The repository must BE $RepoRoot -----------------------------------
# Q37's defect, in a second tool. git walks UP the directory tree, so pointed at
# a directory nested inside some other checkout -- an extracted package
# unpacked beside a reviewer's own repositories -- every git command below
# answers from the ENCLOSING repository: its HEAD, its file list, its bytes.
# The result is a faithful cut of the wrong repository, under the name of the
# directory that was asked for, with a manifest naming the enclosing commit.
# Found by S4 task 5.3's provenance sweep, and measured on a nested fixture
# before this guard existed.
#
# $ErrorActionPreference is relaxed for the one probe: under 'Stop', Windows
# PowerShell 5.1 turns a native command's stderr into a terminating error, and
# "not a git repository" is an expected answer here, not a crash.
$prevPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$toplevel = & git rev-parse --show-toplevel 2>$null
$toplevelExit = $LASTEXITCODE
$ErrorActionPreference = $prevPreference
if ($toplevelExit -ne 0 -or -not $toplevel) {
  throw "RepoRoot '$RepoRoot' is not a git checkout. A package is cut from a commit."
}
$resolvedTop  = [System.IO.Path]::GetFullPath((@($toplevel)[0]).Trim()).TrimEnd('\')
$resolvedRoot = [System.IO.Path]::GetFullPath($RepoRoot).TrimEnd('\')
if ($resolvedTop -ne $resolvedRoot) {
  throw "RepoRoot '$resolvedRoot' is not its own git repository: git answers from '$resolvedTop', which encloses it. Refusing to package the enclosing repository under this name."
}

$zipPath      = Join-Path $RepoRoot "$Name.zip"
$manifestPath = Join-Path $RepoRoot 'SHA256_MANIFEST.txt'
$MANIFEST_ENTRY = 'SHA256_MANIFEST.txt'

# --- 1. Package HEAD, not the working tree ---------------------------------
# The first version of this script packaged files off DISK and refused to run
# when anything tracked was modified. That was the wrong instinct twice over:
# it made the package un-cuttable whenever a collaborator had uncommitted work
# in a file this package does not care about, and -- worse -- packaging the
# working tree is precisely what "reproducible from a commit" is not.
#
# HEAD is extracted to a scratch directory and everything is built from there.
# Anyone with the repository can reproduce the package byte for byte from the
# commit named below -- true since the S5AA second audit fixed the entry times
# (section 4), and on the envelope's Windows PowerShell, whose deflate is what
# the bytes depend on; the manifest's per-file hashes hold on any machine.
# Uncommitted work is REPORTED, never silently shipped and never quietly dropped.
$commit = (git rev-parse HEAD).Trim()
$scratch = Join-Path ([System.IO.Path]::GetTempPath()) ("pkg-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
try {

$dirty = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' })
if ($dirty.Count -gt 0) {
  Write-Output "NOTE: $($dirty.Count) tracked file(s) differ from HEAD. The package ships HEAD's version, NOT what is on disk:"
  $dirty | ForEach-Object { "  $_" }
  Write-Output ''
}
$untracked = @(git status --porcelain | Where-Object { $_ -match '^\?\?' })
if ($untracked.Count -gt 0) {
  Write-Output "NOTE: $($untracked.Count) untracked file(s) are NOT in this package:"
  $untracked | ForEach-Object { "  $($_.Substring(3))" }
  Write-Output ''
}

# --- 2. The file list, and HEAD's content for each -------------------------
# SHA256_MANIFEST.txt is excluded from the file list because it is REGENERATED
# below. It is tracked, so without this exclusion the zip carried it twice --
# HEAD's stale copy and the fresh one, under one entry name. A zip with a
# duplicate entry is ambiguous: extractors take the first or the last, so an
# auditor could verify against the STALE manifest and see spurious mismatches
# on every file changed since it was last committed. Found by counting distinct
# entry names against total entries, which is now asserted at the end.
$files = @(git ls-tree -r --name-only $commit |
  Where-Object { $_ -notlike '*.zip.sha256' -and $_ -ne $MANIFEST_ENTRY } |
  Sort-Object)
Write-Output "packaging $($files.Count) file(s) from $commit"

# `git archive` writes the tree with forward-slash paths and HEAD's exact
# bytes. Written to a FILE rather than piped into tar: a PowerShell pipeline
# carries strings, not bytes, so piping a tar stream through it corrupts the
# archive ("Unrecognized archive format"). -o keeps the bytes out of the shell.
#
# core.autocrlf/core.eol are FORCED OFF for the export. `git archive` otherwise
# applies this machine's checkout conversion, and the package then carries a
# platform-converted rendering of the repository rather than the repository.
# That is not cosmetic: it changes file BYTES, so every byte-level pin breaks
# at once. Measured -- the shipped artifact hashed 8d1969f5... instead of the
# 73c81504... that tests/lib/harness.js pins, and 27 DOM tests failed inside
# the package while passing in the repo it was cut from. A package whose bytes
# are not the repository's bytes cannot be verified against it.
$tarPath = Join-Path $scratch '_head.tar'
& git -c core.autocrlf=false -c core.eol=lf archive --format=tar -o $tarPath $commit
if ($LASTEXITCODE -ne 0) { throw "git archive failed with $LASTEXITCODE" }
& tar -x -f $tarPath -C $scratch
if ($LASTEXITCODE -ne 0) { throw "tar extract failed with $LASTEXITCODE" }
Remove-Item -LiteralPath $tarPath -Force

# --- 3. The manifest, which never contains itself --------------------------
$lines = New-Object System.Collections.Generic.List[string]
$lines.Add('# SHA-256 of every file in this package.')
$lines.Add("# The manifest itself is NOT listed: it cannot contain its own hash.")
$lines.Add("# Built from commit: $commit")
$lines.Add("# Files: $($files.Count)")
$lines.Add('')
foreach ($f in $files) {
  $h = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $scratch $f)).Hash.ToLower()
  $lines.Add("$h  $f")
}
[System.IO.File]::WriteAllLines($manifestPath, $lines)
Write-Output "manifest written: $($files.Count) hashes"

# --- 4. The zip, with forward-slash entry names ----------------------------
# EVERY ENTRY CARRIES THE COMMIT'S OWN TIME. CreateEntryFromFile copies the
# source file's modified time, and every source here was extracted to a fresh
# scratch directory moments earlier -- so the header's "byte for byte" promise
# held for the FILES (the manifest proves them) but never for the zip: the S5AA
# second audit cut the same commit twice, three seconds apart, and got two
# hashes. The committer date is a property of the commit, so it is the one time
# every re-cut agrees on.
# In Create mode the time can only be set BEFORE the entry is written, which
# CreateEntryFromFile does not allow -- hence CreateEntry and an explicit copy.
$entryTime = [System.DateTimeOffset]::Parse((git show -s --format=%cI $commit).Trim())
function Add-PackageEntry($zip, $source, $name) {
  $entry = $zip.CreateEntry($name, [System.IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime = $entryTime
  $out = $entry.Open()
  try { $bytes = [System.IO.File]::ReadAllBytes($source); $out.Write($bytes, 0, $bytes.Length) } finally { $out.Dispose() }
}
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
try {
  foreach ($f in $files) {
    Add-PackageEntry $zip (Join-Path $scratch $f) ($f -replace '\\', '/')
  }
  Add-PackageEntry $zip $manifestPath $MANIFEST_ENTRY
} finally {
  $zip.Dispose()
}

# --- 5. Assert the zip is well-formed before anyone is told it is -----------
# Duplicate entry names are the failure this build already had once. Checking
# it here means the script cannot ship that defect again silently.
$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $names = $check.Entries | ForEach-Object { $_.FullName }
  $dupes = $names | Group-Object | Where-Object { $_.Count -gt 1 }
  if ($dupes) { throw "duplicate zip entries: $(($dupes | ForEach-Object { $_.Name }) -join ', ')" }
  if ($names.Count -ne ($files.Count + 1)) { throw "entry count $($names.Count) != expected $($files.Count + 1)" }
  $backslash = $names | Where-Object { $_ -match '\\' }
  if ($backslash) { throw "entry names contain backslashes: $($backslash[0])" }
} finally { $check.Dispose() }

# The shipped artifact is pinned by hash inside tests/lib/harness.js. If the
# packaged copy does not hash to that value, every DOM test in the package
# fails while passing in the repo -- which is what a line-ending conversion on
# export already did once. Checking it here means the package cannot ship in
# that state again.
$harness = Get-Content (Join-Path $scratch 'tests/lib/harness.js') -Raw
$m = [regex]::Match($harness, "EXPECTED_SHA256\s*=\s*'([0-9a-f]{64})'")
if (-not $m.Success) { throw 'could not find EXPECTED_SHA256 in tests/lib/harness.js' }
$artifactHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $scratch 'investment-calculator-v2c.html')).Hash.ToLower()
if ($artifactHash -ne $m.Groups[1].Value) {
  throw "packaged investment-calculator-v2c.html hashes $artifactHash but harness.js pins $($m.Groups[1].Value)"
}
Write-Output "artifact hash matches the harness pin: $artifactHash"

$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLower()
[System.IO.File]::WriteAllText("$zipPath.sha256", "$zipHash  $Name.zip`n")

Write-Output ''
Write-Output "zip     : $zipPath"
Write-Output "commit  : $commit"
Write-Output "entries : $($files.Count + 1)  (files from HEAD + the manifest)"
Write-Output "sha256  : $zipHash"

} finally {
  if (Test-Path $scratch) { Remove-Item -LiteralPath $scratch -Recurse -Force }
}
