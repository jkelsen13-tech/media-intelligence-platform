#!/usr/bin/env python3
"""Pre-push guard — mechanical cross-check BEFORE any GitHub MCP push_files call.

Closes the recurring split-push / message-mismatch class (run-record
disclosures D8, D10, and trackb3-v4's instance): the files array and the
commit message were assembled separately and never mechanically
cross-checked. This script makes the check structural instead of
procedural.

Usage:
  python3 scripts/pre_push_check.py <manifest.json>

Manifest shape (staged verbatim bytes — what the push call WILL carry):
  {
    "message": "<commit message, exactly as it will be sent>",
    "files": [{"path": "repo/relative/path", "content": "<full content>"}]
  }

Checks (all must pass):
  1. Message <-> file list, BOTH directions:
     - every file in the manifest must be named (by repo path or basename)
       in the message;
     - every repo path mentioned in the message must be in the manifest
       (paths are extracted from the src/, tests/, verifier/, scripts/,
        public/, supabase/, docs/ namespaces and root-level config files).
  2. Byte-parity: each staged content must hash (git blob SHA) identically
     to the file on disk in the working tree — catches transcription slips
     (D6/D9 class) before the push rather than after.

Exit 0 with a PASS manifest printout = the push may proceed. Anything else
blocks. The PASS output for a push must appear in the session transcript
before the push_files call it authorizes.
"""
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Repo path namespaces the guard recognizes inside commit messages.
PATH_RE = re.compile(
    r"(?:^|[\s`(\"'])((?:src|tests|verifier|scripts|public|supabase|docs)/[\w./-]+)"
)
ROOT_FILES = {
    "package.json", "package-lock.json", "vite.config.js", "index.html",
    "README.md", ".gitignore", "eslint.config.js",
}


def blob_sha(data: bytes) -> str:
    return subprocess.run(
        ["git", "hash-object", "--stdin"], input=data, capture_output=True, check=True
    ).stdout.decode().strip()


def mentioned_paths(message: str):
    paths = set(PATH_RE.findall(message))
    for token in re.findall(r"[\w./-]+", message):
        if token in ROOT_FILES:
            paths.add(token)
    # strip trailing punctuation that rides along in prose
    return {p.rstrip(".,;:)") for p in paths}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: pre_push_check.py <manifest.json>", file=sys.stderr)
        return 2
    manifest = json.load(open(sys.argv[1]))
    message = manifest["message"]
    files = manifest["files"]
    listed = [f["path"] for f in files]

    failures = []

    # --- check 1: message <-> file list, both directions
    mentioned = mentioned_paths(message)
    for p in listed:
        base = os.path.basename(p)
        if p not in mentioned and base not in {os.path.basename(m) for m in mentioned}:
            failures.append(f"CARRIED but NOT described in message: {p}")
    for m in sorted(mentioned):
        if m not in listed and m not in {os.path.basename(p) for p in listed}:
            failures.append(f"DESCRIBED in message but NOT carried: {m}")

    # --- check 2: byte-parity staged vs working tree
    for f in files:
        disk = os.path.join(REPO, f["path"])
        if not os.path.exists(disk):
            failures.append(f"NEW FILE (no disk twin to parity-check): {f['path']} — confirm intentional")
            continue
        staged = blob_sha(f["content"].encode())
        local = blob_sha(open(disk, "rb").read())
        if staged != local:
            failures.append(
                f"BYTE MISMATCH: {f['path']} staged {staged[:8]} != disk {local[:8]}"
            )

    # --- manifest printout
    print("=== pre-push guard ===")
    print(f"files ({len(listed)}):")
    for p in listed:
        print(f"  - {p}")
    first_line = message.splitlines()[0] if message else ""
    print(f"message: {first_line!r}")
    if failures:
        print("FAIL:")
        for f_ in failures:
            print(f"  ✗ {f_}")
        return 1
    print("PASS — message, file list, and staged bytes are consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
