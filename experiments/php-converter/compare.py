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

    def node(payload):
        return invoke(node_command, payload)[0]

    rows = []
    for item in json.loads((ROOT / "fixtures.json").read_text()):
        doc_id = "probe-" + item["id"]
        baseline = node({"mode": "markdown", "source": item["source"], "documentId": doc_id})
        candidate, elapsed = php({"mode": "markdown", "source": item["source"]})
        row = {
            "id": item["id"],
            "category": item["category"],
            "node_accepts": baseline.get("ok") is True,
            "php_accepts": candidate.get("ok") is True,
            "php_process_ms": elapsed,
        }
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
            accepted = node(
                {
                    "mode": "blocks",
                    "base": baseline["document"],
                    "serialized": candidate["serialized"],
                    "documentId": doc_id,
                }
            )
            row["node_accepts_php_blocks"] = bool(accepted.get("ok"))
            row["node_canonical_blocks_equal"] = bool(
                accepted.get("ok")
                and accepted["document"]["serialized"] == baseline["document"]["serialized"]
            )
            if not accepted.get("ok"):
                row["node_blocks_rejection"] = accepted.get("code")
        if baseline.get("ok"):
            reverse, _ = php({"mode": "blocks", "serialized": baseline["document"]["serialized"]})
            row["php_accepts_node_blocks"] = bool(reverse.get("ok"))
            if reverse.get("ok"):
                restored = node(
                    {"mode": "markdown", "source": reverse["source"], "documentId": doc_id}
                )
                row["reverse_node_canonical_blocks_equal"] = bool(
                    restored.get("ok")
                    and restored["document"]["serialized"] == baseline["document"]["serialized"]
                )
        rows.append(row)
    report = {
        "schema": 1,
        "oracle_wordpress": manifest["wordpress"],
        "oracle_node": manifest["node"],
        "oracle_kernel_sha256": kernel_digest,
        "scope": "Synthetic fixtures only; no database, saves, production content or full compatibility proof.",
        "php_subprocess_functions_disabled": DISABLED.split(","),
        "php_version": subprocess.check_output([args.php, "-r", "echo PHP_VERSION;"], text=True),
        "rows": rows,
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
    # Unsupported exploratory fixtures are findings, not green compatibility assertions.
    # Every accepted source must still support a real, stable reverse conversion.
    failures = [
        r["id"] for r in rows if r["php_accepts"] and not r.get("php_roundtrip_exact_blocks")
    ]
    failures.extend(
        r["id"] + ":oracle-mismatch"
        for r in rows
        if r["php_accepts"]
        and r["node_accepts"]
        and (
            not r.get("node_canonical_blocks_equal")
            or not r.get("reverse_node_canonical_blocks_equal")
        )
    )
    if failures:
        raise SystemExit("Accepted PHP cases failed own roundtrip: " + ", ".join(failures))


if __name__ == "__main__":
    main()
