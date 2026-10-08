"""Compare an isolated PHP probe with the existing Node oracle; never save content."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent
DISABLED = "exec,shell_exec,system,passthru,proc_open,popen,pcntl_exec"


def invoke(command, payload, env=None):
    started = time.perf_counter()
    result = subprocess.run(
        command,
        input=json.dumps(payload, ensure_ascii=False),
        text=True,
        capture_output=True,
        timeout=30,
        env=env,
    )
    elapsed = round((time.perf_counter() - started) * 1000, 2)
    try:
        output = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise RuntimeError(
            f"Probe returned no JSON (exit {result.returncode}): {result.stderr[:300]}"
        )
    return output, elapsed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--php", default="php")
    parser.add_argument("--output", type=Path, default=ROOT / "results-comparison.json")
    args = parser.parse_args()
    php_command = [args.php, "-d", f"disable_functions={DISABLED}", str(ROOT / "cli.php")]
    runtime = args.runtime.resolve()
    manifest = json.loads((runtime / "manifest.json").read_text())
    kernel_digest = hashlib.sha256(
        (ROOT.parent.parent / "plugin/kernel.js").read_bytes()
    ).hexdigest()
    if kernel_digest != manifest["kernel_sha256"]:
        raise SystemExit(
            "Oracle kernel differs from this checkout; rebuild a matching test runtime."
        )
    node_command = [str(runtime / "node/bin/node"), str(runtime / "worker.cjs"), str(runtime)]

    def php(payload):
        return invoke(php_command, payload)

    def node_batch(payloads):
        outputs = []
        for start in range(0, len(payloads), 5):
            reply, _ = invoke(node_command, {"mode": "batch", "items": payloads[start : start + 5]})
            if not reply.get("ok") or not isinstance(reply.get("document"), list):
                raise RuntimeError("Oracle batch failed: " + json.dumps(reply))
            if len(reply["document"]) != len(payloads[start : start + 5]):
                raise RuntimeError("Oracle returned an incomplete batch")
            outputs.extend(reply["document"])
        return outputs

    library = ROOT.parent.parent / "plugin/includes/php-converter"
    tracked = (
        sorted(ROOT.glob("*.php"))
        + sorted(library.glob("*.php"))
        + [library / "composer.lock", ROOT / "fixtures.json", ROOT / "paired-fixtures.json"]
    )

    def fingerprints():
        return {
            str(p.relative_to(ROOT.parent.parent)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in tracked
        }

    initial_fingerprints = fingerprints()
    fixtures = json.loads((ROOT / "fixtures.json").read_text())
    baselines = node_batch(
        [
            {"mode": "markdown", "source": item["source"], "documentId": "probe-" + item["id"]}
            for item in fixtures
        ]
    )
    print(f"Loaded {len(baselines)} oracle source results", flush=True)
    rows = []
    jobs = []
    for item, baseline in zip(fixtures, baselines):
        doc_id = "probe-" + item["id"]
        candidate, elapsed = php({"mode": "markdown", "source": item["source"]})
        row = {
            "id": item["id"],
            "category": item["category"],
            "expected_php": item["expected_php"],
            "expected_node": item["expected_node"],
            "node_accepts": baseline.get("ok") is True,
            "php_accepts": candidate.get("ok") is True,
            "php_process_ms": elapsed,
        }
        if item.get("policy_difference"):
            row["policy_difference"] = item["policy_difference"]
        if not candidate.get("ok"):
            row["php_rejection"] = candidate.get("code", candidate.get("message"))
        if not baseline.get("ok"):
            row["node_rejection"] = baseline.get("code")
        if candidate.get("ok"):
            reverse, _ = php({"mode": "blocks", "serialized": candidate["serialized"]})
            row["php_reverse_accepts"] = bool(reverse.get("ok"))
            if reverse.get("ok"):
                rebuilt, _ = php({"mode": "markdown", "source": reverse["source"]})
                row["php_roundtrip_exact_blocks"] = bool(
                    rebuilt.get("ok") and rebuilt["serialized"] == candidate["serialized"]
                )
        if baseline.get("ok") and candidate.get("ok"):
            row["serialized_byte_equal"] = (
                candidate["serialized"] == baseline["document"]["serialized"]
            )
            jobs.append(
                (
                    row,
                    "blocks",
                    baseline["document"]["serialized"],
                    {
                        "mode": "blocks",
                        "base": baseline["document"],
                        "serialized": candidate["serialized"],
                        "documentId": doc_id,
                    },
                )
            )
        if baseline.get("ok"):
            reverse, _ = php({"mode": "blocks", "serialized": baseline["document"]["serialized"]})
            row["php_accepts_node_blocks"] = bool(reverse.get("ok"))
            if reverse.get("ok"):
                jobs.append(
                    (
                        row,
                        "reverse",
                        baseline["document"]["serialized"],
                        {
                            "mode": "markdown",
                            "source": reverse["source"],
                            "documentId": doc_id,
                        },
                    )
                )
        rows.append(row)
        if len(rows) % 10 == 0:
            print(f"Compared {len(rows)} source fixtures", flush=True)
    results = node_batch([job[3] for job in jobs])
    for (row, kind, expected_blocks, _), result in zip(jobs, results):
        equal = bool(result.get("ok") and result["document"]["serialized"] == expected_blocks)
        if kind == "blocks":
            row["node_accepts_php_blocks"] = bool(result.get("ok"))
            row["node_canonical_blocks_equal"] = equal
            if not result.get("ok"):
                row["node_blocks_rejection"] = result.get("code")
        else:
            row["reverse_node_canonical_blocks_equal"] = equal
    pairs = []
    pair_requests = []
    for item in json.loads((ROOT / "paired-fixtures.json").read_text()):
        payload = {"mode": "paired_restore", **item}
        for variant, request in [
            ("exact", payload),
            ("equivalent-source", {**payload, "source": item["source"] + "\n"}),
            ("changed-source", {**payload, "source": item["source"] + "\nChanged."}),
            ("changed-blocks", {**payload, "serialized": item["serialized"] + "tamper"}),
            ("whitespace-id", {**payload, "documentId": " \t"}),
            ("extra-block-whitespace", {**payload, "serialized": item["serialized"] + "\n"}),
            ("missing-id", {**payload, "documentId": ""}),
        ]:
            pair_requests.append(
                (item["id"] + ":" + variant, variant in {"exact", "equivalent-source"}, request)
            )
    for (name, expected, request), existing in zip(
        pair_requests, node_batch([item[2] for item in pair_requests])
    ):
        candidate, _ = php(request)
        pairs.append(
            {
                "id": name,
                "expected": expected,
                "node_accepts": existing.get("ok") is True,
                "php_accepts": candidate.get("ok") is True,
                "php_preserves_pair": bool(
                    candidate.get("ok")
                    and candidate.get("source") == request["source"]
                    and candidate.get("serialized") == request["serialized"]
                ),
                "php_rejection": candidate.get("code"),
            }
        )
    report = {
        "schema": 2,
        "php_and_fixture_sha256": initial_fingerprints,
        "inputs_unchanged_during_run": initial_fingerprints == fingerprints(),
        "oracle_wordpress": manifest["wordpress"],
        "oracle_node": manifest["node"],
        "oracle_kernel_sha256": kernel_digest,
        "scope": "Synthetic fixtures only; no database, saves, production content or full compatibility proof.",
        "php_subprocess_functions_disabled": DISABLED.split(","),
        "php_version": subprocess.check_output([args.php, "-r", "echo PHP_VERSION;"], text=True),
        "rows": rows,
        "paired_snapshots": pairs,
    }
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(
        json.dumps(
            {
                "fixtures": len(rows),
                "php_accepts": sum(r["php_accepts"] for r in rows),
                "node_accepts": sum(r["node_accepts"] for r in rows),
            },
            ensure_ascii=False,
        )
    )
    # Required support and rejection policies are explicit; missing features fail this stage.
    # Every accepted source must also support a real, stable reverse conversion.
    failures = [
        r["id"] for r in rows if r["php_accepts"] and not r.get("php_roundtrip_exact_blocks")
    ]
    failures.extend(
        r["id"] + ":acceptance-policy"
        for r in rows
        if r["php_accepts"] != r["expected_php"] or r["node_accepts"] != r["expected_node"]
    )
    failures.extend(
        r["id"] + ":oracle-mismatch"
        for r in rows
        if r["php_accepts"]
        and r["node_accepts"]
        and (
            not r.get("serialized_byte_equal")
            or not r.get("node_canonical_blocks_equal")
            or not r.get("reverse_node_canonical_blocks_equal")
        )
    )
    failures.extend(
        r["id"] + ":paired-contract"
        for r in pairs
        if r["php_accepts"] != r["expected"]
        or r["node_accepts"] != r["expected"]
        or (r["expected"] and not r["php_preserves_pair"])
    )
    if initial_fingerprints != fingerprints():
        failures.append("implementation-or-fixtures-changed-during-run")
    if failures:
        raise SystemExit("Conversion contract checks failed: " + ", ".join(failures))


if __name__ == "__main__":
    main()
