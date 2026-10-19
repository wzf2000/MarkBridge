"""Bind complete Playwright identities and durations to the same-source CI build."""

import argparse
from collections import Counter
import json
import os
from pathlib import Path
import re

GROUPS = {
    "chromium-desktop": {"desktop-chromium"},
    "chromium-mobile": {"mobile-chromium"},
    "compatibility": {
        "desktop-firefox",
        "mobile-firefox",
        "desktop-webkit",
        "mobile-webkit",
    },
}


def identity(test):
    return test["id"], test["project"]


def inventory(tests):
    keys = [identity(test) for test in tests]
    if not keys or any(not all(key) for key in keys) or len(keys) != len(set(keys)):
        raise ValueError("Empty or duplicate browser test identities")
    return set(keys)


def read(path):
    return json.loads(path.read_text())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def source(document, sha):
    if document.get("schema") != 1 or document.get("source_sha") != sha:
        raise ValueError("Browser evidence schema/source SHA mismatch")


def entries(report):
    if report.get("errors"):
        raise ValueError("Playwright reported global errors")
    if "tests" in report:
        return [(test, dict(test, projectName=test["project"])) for test in report["tests"]]
    result = []

    def visit(suite):
        for spec in suite.get("specs", []):
            for test in spec["tests"]:
                result.append((spec, test))
        for child in suite.get("suites", []):
            visit(child)

    for suite in report["suites"]:
        visit(suite)
    return result


def discover(report, sha):
    source(report, sha)
    tests = [{"id": spec["id"], "project": test["projectName"]} for spec, test in entries(report)]
    inventory(tests)
    if {test["project"] for test in tests} != set.union(*GROUPS.values()):
        raise ValueError("Discovery must cover all six registered browser projects")
    return {"schema": 1, "source_sha": sha, "tests": tests}


def expected(discovery, sha, group=None):
    source(discovery, sha)
    keys = inventory(discovery["tests"])
    projects = {project for _, project in keys}
    if projects != set.union(*GROUPS.values()):
        raise ValueError("Discovery projects are incomplete")
    return {key for key in keys if group is None or key[1] in GROUPS[group]}


def summarize(report, discovery, sha, group):
    source(report, sha)
    required = expected(discovery, sha, group)
    if report.get("status", "passed") != "passed":
        raise ValueError("Browser run failed or was interrupted")
    tests = []
    for spec, test in entries(report):
        results = test["results"]
        if (
            not spec["ok"]
            or test["status"] != "expected"
            or test["expectedStatus"] != "passed"
            or len(results) != 1
            or results[0]["status"] != "passed"
            or results[0].get("retry", 0) != 0
            or results[0].get("errors")
        ):
            raise ValueError("Browser test skipped, retried, failed or interrupted: " + spec["id"])
        tests.append(
            {
                "id": spec["id"],
                "project": test["projectName"],
                "title": spec.get("title", ""),
                "duration_ms": results[0]["duration"],
                "status": "passed",
                "retry": 0,
                "attempts": 1,
            }
        )
    if inventory(tests) != required:
        raise ValueError("Browser group identities differ from same-source discovery")
    stats = report["stats"]
    if stats["expected"] != len(required) or any(
        stats[key] for key in ["unexpected", "flaky", "skipped"]
    ):
        raise ValueError("Browser suite incomplete: " + json.dumps(stats))
    return {
        "schema": 1,
        "source_sha": sha,
        "group": group,
        "status": "passed",
        "duration_ms": stats["duration"],
        "tests": tests,
    }


def gate(discovery, reports, sha):
    required = expected(discovery, sha)
    if Counter(report.get("group") for report in reports) != Counter(GROUPS.keys()):
        raise ValueError("Missing, extra or duplicate browser group reports")
    tests = []
    for report in reports:
        source(report, sha)
        if report.get("status") != "passed":
            raise ValueError("Browser group did not pass")
        if any(
            test.get("status") != "passed" or test.get("retry") != 0 or test.get("attempts") != 1
            for test in report["tests"]
        ):
            raise ValueError("Browser evidence contains skips, retries or failures")
        if inventory(report["tests"]) != expected(discovery, sha, report["group"]):
            raise ValueError("Browser group coverage differs from discovery")
        tests.extend(report["tests"])
    if inventory(tests) != required:
        raise ValueError("Browser coverage missing or duplicated across groups")
    return {
        "schema": 1,
        "source_sha": sha,
        "status": "passed",
        "count": len(tests),
        "groups": [{key: report[key] for key in ["group", "duration_ms"]} for report in reports],
        "tests": sorted(tests, key=lambda test: (-test["duration_ms"], identity(test))),
        "slowest": sorted(tests, key=lambda test: (-test["duration_ms"], identity(test)))[:20],
    }


def step_summary(report):
    lines = [
        "## Browser coverage and durations",
        "",
        f"{report['count']} unique tests passed with no skips or retries. Source: `{report['source_sha']}`.",
        "",
        "| Group | Suite time |",
        "| --- | ---: |",
    ]
    for group in report["groups"]:
        lines.append(f"| {group['group']} | {group['duration_ms'] / 1000:.1f}s |")
    lines.extend(["", "### Slowest tests", "", "| Project | Test | Time |", "| --- | --- | ---: |"])
    for test in report["slowest"]:
        title = (test.get("title") or test["id"]).replace("|", "\\|").replace("\n", " ")
        lines.append(f"| {test['project']} | {title} | {test['duration_ms'] / 1000:.2f}s |")
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["discover", "report", "gate"])
    parser.add_argument("--sha", required=True)
    parser.add_argument("--input", type=Path)
    parser.add_argument("--discovery", type=Path)
    parser.add_argument("--reports", type=Path)
    parser.add_argument("--group", choices=GROUPS)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-f]{40}", args.sha):
        parser.error("Source must be a full commit SHA")
    try:
        if args.command == "discover":
            result = discover(read(args.input), args.sha)
        elif args.command == "report":
            result = summarize(read(args.input), read(args.discovery), args.sha, args.group)
        else:
            paths = sorted(args.reports.glob("*.json"))
            result = gate(read(args.discovery), [read(path) for path in paths], args.sha)
    except (ValueError, KeyError, OSError, TypeError) as error:
        # A failing shard still emits small source-bound evidence; the job and gate fail.
        write(
            args.output,
            {
                "schema": 1,
                "source_sha": args.sha,
                "group": args.group,
                "status": "failed",
                "error": str(error),
            },
        )
        raise SystemExit(str(error)) from error
    write(args.output, result)
    if args.command == "gate" and os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as summary:
            summary.write(step_summary(result))
    print("Complete same-source browser evidence:", args.command)


if __name__ == "__main__":
    main()
