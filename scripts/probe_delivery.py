"""Read-only, anonymous comparison of two explicitly supplied synthetic HTML resources."""

import argparse
import codecs
import hashlib
import http.client
import json
import re
import ssl
import time
from urllib.parse import urlsplit

MAX_BYTES = 16 * 1024 * 1024


class Arguments(argparse.ArgumentParser):
    def error(self, message):
        # argparse's default diagnostics can echo a private URL or argument value.
        print(
            json.dumps(
                {"ok": False, "error": "ARGUMENT", "hint": "Use --help for accepted options."}
            )
        )
        raise SystemExit(2)


def validate_url(value):
    try:
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or "?" in value
            or "#" in value
            or any(ord(char) <= 32 or ord(char) >= 127 for char in value)
            or "\\" in value
            or parsed.port == 0
        ):
            raise ValueError
        # Accessing port above also rejects malformed/out-of-range port numbers.
        return parsed
    except ValueError:
        raise ValueError("URL") from None


def probe(label, target, expected, limit, mime=None, timeout=15):
    started = time.monotonic()
    result = {
        "target": label,
        "status": None,
        "mime": None,
        "bytes": 0,
        "sha256": None,
        "ok": False,
    }
    connection = None
    digest = hashlib.sha256()
    decoder = codecs.getincrementaldecoder("utf-8-sig")("strict")
    prefix = ""
    text_valid = True
    try:
        connection_type = (
            http.client.HTTPSConnection if target.scheme == "https" else http.client.HTTPConnection
        )
        connection = connection_type(target.hostname, target.port, timeout=timeout)
        # http.client bypasses proxy/cookie/netrc handlers and never follows redirects.
        connection.request(
            "GET",
            target.path or "/",
            headers={"Accept": mime or "text/html, text/plain", "Accept-Encoding": "identity"},
        )
        response = connection.getresponse()
        result["status"] = response.status
        raw_type = response.getheader("Content-Type", "").split(";", 1)[0].strip().lower()
        # Never echo arbitrary header values: a server may include a URL or secret.
        allowed = {mime} if mime else {"text/html", "text/plain"}
        result["mime"] = raw_type if raw_type in {"text/html", "text/plain"} else "unexpected"
        if not 200 <= response.status < 300:
            result["error"] = "HTTP"
            return result
        if raw_type not in allowed:
            result["error"] = "MIME"
            return result
        if response.getheader("Content-Encoding", "identity").lower() not in {"", "identity"}:
            result["error"] = "ENCODING"
            return result
        length = response.getheader("Content-Length")
        if length is not None and (not length.isdecimal() or int(length) > limit):
            result["error"] = "SIZE"
            return result
        while True:
            # Read one byte past the budget to detect an unannounced oversized body.
            if time.monotonic() - started > timeout:
                raise TimeoutError
            chunk = response.read1(min(65536, limit + 1 - result["bytes"]))
            if not chunk:
                break
            result["bytes"] += len(chunk)
            if result["bytes"] > limit:
                result["error"] = "SIZE"
                return result
            digest.update(chunk)
            try:
                text = decoder.decode(chunk)
                if any(
                    (ord(char) < 32 and char not in "\t\r\n") or ord(char) == 127 for char in text
                ):
                    text_valid = False
                if len(prefix) < 4096:
                    prefix = (prefix + text)[:4096]
            except UnicodeDecodeError:
                text_valid = False
        try:
            decoder.decode(b"", final=True)
        except UnicodeDecodeError:
            text_valid = False
        result["sha256"] = digest.hexdigest()
        if length is not None and result["bytes"] != int(length):
            result["error"] = "TRUNCATED"
        elif not text_valid or not re.match(
            r"^\s*(?:<!doctype\s+html\b[^>]*>\s*)?<html(?:\s|>)", prefix, re.I
        ):
            result["error"] = "HTML"
        elif result["sha256"] != expected:
            result["error"] = "DIGEST"
        else:
            result["ok"] = True
    except (OSError, ssl.SSLError, http.client.HTTPException, UnicodeError, ValueError):
        # Exception strings may expose endpoints, DNS names, paths or credentials.
        result["error"] = "NETWORK"
    finally:
        if connection is not None:
            connection.close()
        result["elapsedMs"] = round((time.monotonic() - started) * 1000, 2)
    return result


def main(argv=None):
    parser = Arguments(description=__doc__)
    parser.add_argument(
        "--origin", required=True, help="Explicit anonymous synthetic origin resource URL"
    )
    parser.add_argument(
        "--edge", required=True, help="Explicit anonymous synthetic edge resource URL"
    )
    parser.add_argument("--sha256", required=True, help="Expected SHA-256 of the fixed HTML bytes")
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=524288,
        help="Body budget, 1 through 16777216 (default 524288)",
    )
    parser.add_argument(
        "--mime",
        choices=["text/html", "text/plain"],
        help="Require one MIME; default accepts either component HTML carrier",
    )
    args = parser.parse_args(argv)
    try:
        targets = [
            (label, validate_url(value))
            for label, value in [("origin", args.origin), ("edge", args.edge)]
        ]
        if not 1 <= args.max_bytes <= MAX_BYTES or not re.fullmatch(
            r"[a-fA-F0-9]{64}", args.sha256
        ):
            raise ValueError
    except ValueError:
        print(json.dumps({"ok": False, "error": "INPUT"}))
        return 2
    reports = [
        probe(label, target, args.sha256.lower(), args.max_bytes, args.mime)
        for label, target in targets
    ]
    comparable = all(report["sha256"] is not None for report in reports)
    equal = (
        comparable
        and reports[0]["sha256"] == reports[1]["sha256"]
        and reports[0]["bytes"] == reports[1]["bytes"]
    )
    ok = all(report["ok"] for report in reports) and equal
    print(
        json.dumps({"schema": 1, "ok": ok, "equalBytes": equal, "targets": reports}, sort_keys=True)
    )
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
