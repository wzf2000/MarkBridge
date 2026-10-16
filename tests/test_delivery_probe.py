"""Bounded anonymous delivery checks against an in-process loopback HTTP server."""

from contextlib import redirect_stdout
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import io
import json
from pathlib import Path
import threading
import unittest

SPEC = importlib.util.spec_from_file_location(
    "delivery", Path(__file__).resolve().parents[1] / "scripts/probe_delivery.py"
)
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)
BODY = b'<!doctype html><html lang="en"><body>synthetic</body></html>'
SHA = hashlib.sha256(BODY).hexdigest()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def do_GET(self):
        self.server.requests.append((self.path, dict(self.headers)))
        status, mime, body, length = self.server.replies.get(self.path, (404, "text/plain", b"", 0))
        if status == 0:
            self.connection.close()
            return
        self.send_response(status)
        self.send_header("Content-Type", mime)
        if status == 302:
            self.send_header("Location", "/never-follow-secret")
        if length is not None:
            self.send_header("Content-Length", str(length))
        if self.path.endswith("encoded"):
            self.send_header("Content-Encoding", "gzip")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass


class DeliveryProbe(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.server.requests = []
        self.server.replies = {
            "/source-private": (200, "text/html; charset=utf-8", BODY, len(BODY)),
            "/edge-private": (200, "text/plain", BODY, len(BODY)),
        }

    def run_probe(self, *extra):
        output = io.StringIO()
        with redirect_stdout(output):
            code = probe.main(
                [
                    "--origin",
                    self.base + "/source-private",
                    "--edge",
                    self.base + "/edge-private",
                    "--sha256",
                    SHA,
                    *extra,
                ]
            )
        text = output.getvalue()
        self.assertNotIn("127.0.0.1", text)
        self.assertNotIn("private", text)
        self.assertNotIn("synthetic", text)
        return code, json.loads(text)

    def test_matching_html_carriers_are_anonymous_and_redacted(self):
        code, result = self.run_probe()
        self.assertEqual(code, 0)
        self.assertTrue(result["equalBytes"])
        self.assertEqual([r["target"] for r in result["targets"]], ["origin", "edge"])
        self.assertEqual(result["targets"][0]["bytes"], len(BODY))
        for _, headers in self.server.requests:
            self.assertFalse(
                {"Cookie", "Authorization", "Referer", "Proxy-Authorization"} & headers.keys()
            )
            self.assertEqual(headers["Accept-Encoding"], "identity")

    def test_redirect_http_and_mime_fail_without_following_or_leaking_headers(self):
        for status, mime, expected in [
            (302, "text/html", "HTTP"),
            (503, "text/plain", "HTTP"),
            (200, "application/octet-stream; secret=private", "MIME"),
        ]:
            with self.subTest(status=status, mime=mime):
                self.server.requests.clear()
                self.server.replies["/edge-private"] = (status, mime, BODY, len(BODY))
                code, result = self.run_probe()
                self.assertEqual(code, 1)
                self.assertEqual(result["targets"][1]["error"], expected)
                self.assertEqual(len(self.server.requests), 2)

    def test_announced_and_unannounced_oversize_and_truncation(self):
        for length, limit, expected in [
            (len(BODY), 10, "SIZE"),
            (None, 10, "SIZE"),
            (len(BODY) + 10, 1024, "TRUNCATED"),
        ]:
            with self.subTest(length=length):
                self.server.replies["/edge-private"] = (200, "text/html", BODY, length)
                code, result = self.run_probe("--max-bytes", str(limit))
                self.assertEqual(code, 1)
                self.assertEqual(result["targets"][1]["error"], expected)
                self.assertLessEqual(result["targets"][1]["bytes"], limit + 1)

    def test_digest_difference_and_binary_or_non_html_are_rejected(self):
        for body, expected in [
            (BODY.replace(b"synthetic", b"changed"), "DIGEST"),
            (b"<html>\x00binary</html>", "HTML"),
            (b"<html>\xff</html>", "HTML"),
            (b"ordinary text", "HTML"),
        ]:
            with self.subTest(body=body):
                self.server.replies["/edge-private"] = (200, "text/html", body, len(body))
                code, result = self.run_probe()
                self.assertEqual(code, 1)
                self.assertEqual(result["targets"][1]["error"], expected)

    def test_explicit_mime_and_exact_budget(self):
        code, result = self.run_probe("--max-bytes", str(len(BODY)), "--mime", "text/html")
        self.assertEqual(code, 1)
        self.assertEqual(result["targets"][1]["error"], "MIME")
        self.assertTrue(result["targets"][0]["ok"])

    def test_compressed_response_is_not_treated_as_plain_html(self):
        self.server.replies["/encoded"] = (200, "text/plain", BODY, len(BODY))
        result = probe.probe("edge", probe.validate_url(self.base + "/encoded"), SHA, 1024)
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "ENCODING")
        self.assertEqual(result["bytes"], 0)

    def test_network_failures_and_invalid_arguments_are_redacted(self):
        self.server.replies["/edge-private"] = (0, "text/html", BODY, len(BODY))
        code, result = self.run_probe()
        self.assertEqual(code, 1)
        self.assertEqual(result["targets"][1]["error"], "NETWORK")
        output = io.StringIO()
        with redirect_stdout(output), self.assertRaises(SystemExit) as raised:
            probe.main(["--origin", "http://SECRET.invalid/", "--max-bytes", "SECRET"])
        self.assertEqual(raised.exception.code, 2)
        self.assertNotIn("SECRET", output.getvalue())
        self.assertEqual(json.loads(output.getvalue())["error"], "ARGUMENT")

    def test_unsafe_inputs_do_not_make_requests_or_echo_values(self):
        for url in [
            "file:///secret",
            "https://user:SECRET@example.test/",
            "http://example.test/x?secret=SECRET",
            "http://example.test/#SECRET",
            "http://example.test/?",
            "http://example.test/#",
            "http://example.test:0/",
            "http://example.test:99999/",
            "http://example.test/\nSECRET",
        ]:
            with self.subTest(url=url):
                output = io.StringIO()
                with redirect_stdout(output):
                    code = probe.main(["--origin", url, "--edge", self.base, "--sha256", SHA])
                self.assertEqual(code, 2)
                self.assertEqual(json.loads(output.getvalue())["error"], "INPUT")
                self.assertNotIn("SECRET", output.getvalue())
        self.assertEqual(self.server.requests, [])
        self.assertEqual(self.run_probe("--max-bytes", "16777217")[0], 2)


if __name__ == "__main__":
    unittest.main()
