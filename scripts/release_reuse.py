"""Select same-source main CI artifacts and verify a read-only release transfer."""

import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile

from release_workflow import validate_source, verify_bundle

SHA = re.compile(r"[0-9a-f]{40}")
DIGEST = re.compile(r"sha256:[0-9a-f]{64}")
MAX_AGE = timedelta(days=14)
MAX_DOWNLOAD = 20_000_000


def timestamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def positive_id(value):
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def run_identity(run, repository_id, workflow_id, sha, now):
    """A rerun's unbound old-attempt artifacts are never reuse candidates."""
    try:
        started, ended = timestamp(run["run_started_at"]), timestamp(run["updated_at"])
        return (
            positive_id(run["id"])
            and run["workflow_id"] == workflow_id
            and run["path"] == ".github/workflows/ci.yml"
            and run["event"] == "push"
            and run["head_branch"] == "main"
            and run["head_sha"] == sha
            and run["repository"]["id"] == repository_id
            and run["head_repository"]["id"] == repository_id
            and run["status"] == "completed"
            and run["conclusion"] == "success"
            and run["run_attempt"] == 1
            and now - MAX_AGE <= started <= ended <= now
        )
    except (KeyError, TypeError, ValueError):
        return False


def artifact_identity(artifact, run, repository_id, sha, now, in_progress=False):
    try:
        association = artifact["workflow_run"]
        return (
            positive_id(artifact["id"])
            and artifact["name"] == "markbridge-release-" + sha
            and artifact["expired"] is False
            and DIGEST.fullmatch(artifact["digest"]) is not None
            and 0 < artifact["size_in_bytes"] <= MAX_DOWNLOAD
            and timestamp(run["run_started_at"])
            <= timestamp(artifact["created_at"])
            <= (now if in_progress else timestamp(run["updated_at"]))
            and timestamp(artifact["created_at"]) <= now < timestamp(artifact["expires_at"])
            and association["id"] == run["id"]
            and association["repository_id"] == repository_id
            and association["head_repository_id"] == repository_id
            and association["head_branch"] == "main"
            and association["head_sha"] == sha
        )
    except (KeyError, TypeError, ValueError):
        return False


def fresh_identity(run, repository_id, sha, run_id, attempt):
    return (
        run.get("id") == run_id
        and run.get("run_attempt") == attempt
        and run.get("event") == "workflow_dispatch"
        and run.get("head_branch") == "main"
        and run.get("head_sha") == sha
        and run.get("path") == ".github/workflows/release.yml"
        and run.get("repository", {}).get("id") == repository_id
        and run.get("head_repository", {}).get("id") == repository_id
        and run.get("status") == "in_progress"
        and run.get("conclusion") is None
    )


def select(runs, artifacts_for_run, repository_id, workflow_id, sha, now, force=False):
    if force:
        return None
    candidates = [run for run in runs if run_identity(run, repository_id, workflow_id, sha, now)]
    candidates.sort(key=lambda run: (run["run_started_at"], run["id"]), reverse=True)
    for run in candidates:
        artifacts = [
            artifact
            for artifact in artifacts_for_run(run["id"])
            if artifact.get("name") == "markbridge-release-" + sha
        ]
        if len(artifacts) > 1:
            raise ValueError("Ambiguous same-name CI artifacts; refusing reuse")
        if artifacts and artifact_identity(artifacts[0], run, repository_id, sha, now):
            return {
                "run_id": run["id"],
                "artifact_id": artifacts[0]["id"],
                "artifact_digest": artifacts[0]["digest"],
            }
    return None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, repository, token):
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository):
            raise ValueError("Invalid repository")
        if not token:
            raise ValueError("GitHub read token is required")
        self.repository = repository
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect)

    def request(self, endpoint):
        return urllib.request.Request(
            "https://api.github.com/repos/" + self.repository + endpoint,
            headers={
                "Authorization": "Bearer " + self.token,
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "MarkBridge-release",
            },
        )

    def get(self, endpoint):
        # API authentication/rate limit/server failures propagate; none mean reuse.
        with self.opener.open(self.request(endpoint), timeout=60) as response:
            return json.load(response)

    def pages(self, endpoint, key):
        values = []
        separator = "&" if "?" in endpoint else "?"
        for page in range(1, 101):
            response = self.get(endpoint + separator + f"per_page=100&page={page}")
            batch = response[key]
            if not isinstance(batch, list):
                raise ValueError("Invalid GitHub pagination response")
            values.extend(batch)
            if len(batch) < 100:
                return values
        raise ValueError("GitHub result exceeds release lookup pagination bound")

    def archive(self, artifact_id):
        # Never forward the read token to the temporary storage redirect URL.
        try:
            response = self.opener.open(
                self.request(f"/actions/artifacts/{artifact_id}/zip"), timeout=60
            )
        except urllib.error.HTTPError as error:
            if error.code != 302:
                raise
            location = error.headers["Location"]
            if urllib.parse.urlsplit(location).scheme != "https":
                raise ValueError("Artifact redirect must use HTTPS")
            response = urllib.request.urlopen(location, timeout=60)
        with response:
            data = response.read(MAX_DOWNLOAD + 1)
        if not 0 < len(data) <= MAX_DOWNLOAD:
            raise ValueError("Artifact archive exceeds the download bound")
        return data


def verify_transfer(data, digest, output, version, sha):
    if not DIGEST.fullmatch(digest) or "sha256:" + hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("Downloaded artifact archive digest mismatch")
    names = {
        f"markbridge-{version}.zip",
        f"markbridge-{version}.zip.sha256",
        f"markbridge-{version}.manifest.json",
        "release-notes.md",
        "release-validation.json",
    }
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if (
            len(entries) != len(names)
            or {entry.filename for entry in entries} != names
            or sum(entry.file_size for entry in entries) > MAX_DOWNLOAD
            or any(
                entry.file_size > MAX_DOWNLOAD
                or entry.flag_bits & 1
                or entry.is_dir()
                or (entry.external_attr >> 16) & 0o170000 == 0o120000
                for entry in entries
            )
            or archive.testzip()
        ):
            raise ValueError("Artifact must contain exactly five bounded release files")
        bodies = {name: archive.read(name) for name in names}
    proof = json.loads(bodies["release-validation.json"])
    if proof.get("version") != version or proof.get("source_commit") != sha:
        raise ValueError("Transferred release version/source mismatch")
    if set(proof["files"]) != names - {"release-validation.json"}:
        raise ValueError("Transferred release proof inventory mismatch")
    if any(
        hashlib.sha256(bodies[name]).hexdigest() != digest
        for name, digest in proof["files"].items()
    ):
        raise ValueError("Transferred release file checksum mismatch")
    if not bodies["release-notes.md"].strip():
        raise ValueError("Transferred release notes are empty")
    if output.exists():
        raise ValueError("Transfer output must be a new directory")
    output.mkdir(parents=True)
    for name, body in bodies.items():
        (output / name).write_bytes(body)
    verify_bundle(output, version, sha)


def github_outputs(values):
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["select", "download"])
    parser.add_argument("--sha", required=True)
    parser.add_argument("--version", required=True)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--artifact-id", type=int)
    parser.add_argument("--digest")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not SHA.fullmatch(args.sha):
        parser.error("Use a full source SHA")
    root = Path(__file__).resolve().parents[1]
    validate_source(root, args.version, args.sha)
    if args.command == "select" and args.force:
        github_outputs({"selected_run_id": "", "artifact_id": "", "artifact_digest": ""})
        print("Forced full verification requested")
        return
    api = GitHub(os.environ["GITHUB_REPOSITORY"], os.environ["GH_TOKEN"])
    repository_id = api.get("")["id"]
    workflow_id = api.get("/actions/workflows/ci.yml")["id"]
    now = datetime.now(timezone.utc)
    if args.command == "select":
        runs = api.pages(
            "/actions/workflows/"
            + str(workflow_id)
            + "/runs?event=push&branch=main&head_sha="
            + args.sha,
            "workflow_runs",
        )
        result = select(
            runs,
            lambda run_id: api.pages(f"/actions/runs/{run_id}/artifacts", "artifacts"),
            repository_id,
            workflow_id,
            args.sha,
            now,
        )
        github_outputs(
            {
                "selected_run_id": result["run_id"] if result else "",
                "artifact_id": result["artifact_id"] if result else "",
                "artifact_digest": result["artifact_digest"] if result else "",
            }
        )
        print(
            "Selected complete main CI artifact"
            if result
            else "No reusable artifact; full verification required"
        )
    else:
        if (
            not positive_id(args.run_id)
            or not positive_id(args.artifact_id)
            or not DIGEST.fullmatch(args.digest or "")
        ):
            parser.error("A pinned run, artifact ID and digest are required")
        run = api.get(f"/actions/runs/{args.run_id}")
        artifact = api.get(f"/actions/artifacts/{args.artifact_id}")
        same_run = args.run_id == int(os.environ["GITHUB_RUN_ID"])
        if same_run:
            # Fresh reusable CI outputs are bound to this release run and attempt.
            attempt = int(os.environ["GITHUB_RUN_ATTEMPT"])
            run = api.get(f"/actions/runs/{args.run_id}/attempts/{attempt}")
            if not fresh_identity(run, repository_id, args.sha, args.run_id, attempt):
                raise ValueError("Fresh verification is not associated with this main release run")
        elif not run_identity(run, repository_id, workflow_id, args.sha, now):
            raise ValueError("Selected CI run no longer satisfies reuse provenance")
        artifacts = api.pages(f"/actions/runs/{args.run_id}/artifacts", "artifacts")
        matches = [
            value for value in artifacts if value.get("name") == "markbridge-release-" + args.sha
        ]
        if len(matches) != 1 or matches[0]["id"] != args.artifact_id:
            raise ValueError("Missing or ambiguous selected release artifact")
        if (
            not artifact_identity(artifact, run, repository_id, args.sha, now, in_progress=same_run)
            or artifact["digest"] != args.digest
        ):
            raise ValueError("Selected artifact metadata/source/digest changed")
        verify_transfer(
            api.archive(args.artifact_id), args.digest, args.output, args.version, args.sha
        )
        print("Verified source-bound artifact transfer")


if __name__ == "__main__":
    main()
