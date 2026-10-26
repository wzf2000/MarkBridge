"""Pinned CI download retries, using only in-memory responses and temporary local files."""

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

spec = importlib.util.spec_from_file_location(
    "ci_wordpress", Path(__file__).resolve().parents[1] / "scripts/prepare_ci_wordpress.py"
)
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class Response:

    def __init__(self, body):
        self.body = body
        self.limit = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def read(self, limit):
        self.limit = limit
        return self.body


class DependencyTests(unittest.TestCase):

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.body = b"fixed public fixture"
        self.url = "https://public.invalid/fixed.zip"
        self.pins = {"fixture": {"url": self.url, "sha256": hashlib.sha256(self.body).hexdigest()}}

    def tearDown(self):
        self.temp.cleanup()

    def fetch(self):
        return ci.dependency("fixture", self.root, self.pins)

    def test_transient_statuses_retry_at_most_three_times(self):
        response = Response(self.body)
        errors = [
            urllib.error.HTTPError(self.url, code, "temporary", {}, None) for code in [429, 504]
        ]
        with patch.object(ci.urllib.request, "urlopen", side_effect=errors + [response]) as call:
            with patch.object(ci.time, "sleep") as sleep:
                self.assertEqual(self.fetch().read_bytes(), self.body)
                self.assertEqual(call.call_count, 3)
                self.assertEqual([c.args for c in sleep.call_args_list], [(1,), (2,)])
        self.assertEqual(response.limit, 64 * 1024 * 1024 + 1)

    def test_timeouts_are_transient(self):
        with patch.object(
            ci.urllib.request,
            "urlopen",
            side_effect=[
                TimeoutError(),
                urllib.error.URLError(TimeoutError()),
                Response(self.body),
            ],
        ) as call:
            with patch.object(ci.time, "sleep"):
                self.fetch()
                self.assertEqual(call.call_count, 3)

    def test_exhaustion_stops_after_three(self):
        with patch.object(ci.urllib.request, "urlopen", side_effect=TimeoutError()) as call:
            with patch.object(ci.time, "sleep"):
                with self.assertRaises(TimeoutError):
                    self.fetch()
                self.assertEqual(call.call_count, 3)
                self.assertFalse((self.root / "fixed.zip").exists())

    def test_permanent_http_and_network_errors_do_not_retry(self):
        for error in [
            urllib.error.HTTPError(self.url, 404, "not found", {}, None),
            urllib.error.URLError("DNS failure"),
        ]:
            with self.subTest(error=type(error).__name__):
                with patch.object(ci.urllib.request, "urlopen", side_effect=error) as call:
                    with patch.object(ci.time, "sleep") as sleep:
                        with self.assertRaises(type(error)):
                            self.fetch()
                        self.assertEqual(call.call_count, 1)
                        sleep.assert_not_called()

    def test_digest_and_capacity_failures_do_not_retry_or_cache(self):
        with patch.object(
            ci.urllib.request, "urlopen", return_value=Response(b"wrong digest")
        ) as call:
            with patch.object(ci.time, "sleep") as sleep:
                with self.assertRaises(RuntimeError):
                    self.fetch()
                self.assertEqual(call.call_count, 1)
                sleep.assert_not_called()
                self.assertFalse((self.root / "fixed.zip").exists())
        with patch.object(ci, "DOWNLOAD_LIMIT", 8):
            with patch.object(
                ci.urllib.request, "urlopen", return_value=Response(b"x" * 9)
            ) as call:
                with self.assertRaises(RuntimeError):
                    self.fetch()
                self.assertEqual(call.call_count, 1)

    def test_cache_keeps_pin_and_capacity_checks(self):
        target = self.root / "fixed.zip"
        target.write_bytes(self.body)
        with patch.object(ci.urllib.request, "urlopen") as call:
            self.assertEqual(self.fetch(), target)
            call.assert_not_called()
            with patch.object(ci, "DOWNLOAD_LIMIT", 8):
                with self.assertRaises(RuntimeError):
                    self.fetch()
            target.write_bytes(b"bad cache")
            with self.assertRaises(RuntimeError):
                self.fetch()
            call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
