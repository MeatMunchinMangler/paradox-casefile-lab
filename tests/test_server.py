"""Loopback HTTP and path isolation regressions, with no outbound network."""
import http.client
import json
import threading
import unittest
from pathlib import Path
from urllib.parse import quote

from server import make_server


class LocalServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = make_server(0)
        cls.thread = threading.Thread(target=cls.service.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.service.server_port

    @classmethod
    def tearDownClass(cls):
        cls.service.shutdown()
        cls.service.server_close()
        cls.thread.join(timeout=3)

    def request(self, path, method="GET"):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=4)
        try:
            conn.request(method, path)
            response = conn.getresponse()
            body = response.read()
            return response.status, dict(response.getheaders()), body
        finally:
            conn.close()

    def test_loopback_only(self):
        self.assertEqual(self.service.server_address[0], "127.0.0.1")

    def test_index_and_challenge_query(self):
        status, headers, body = self.request("/?case=the-last-lift")
        self.assertEqual(status, 200)
        self.assertIn(b"PARADOX", body)
        self.assertIn("default-src 'self'", headers["Content-Security-Policy"])
        self.assertEqual(headers["Referrer-Policy"], "no-referrer")

    def test_case_data_is_public_fiction(self):
        status, headers, body = self.request("/data/cases.json")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(len(json.loads(body)), 12)
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_js_and_css_and_favicon(self):
        for path in ("/app.js", "/style.css", "/favicon.svg", "/manifest.webmanifest", "/privacy.html"):
            with self.subTest(path=path):
                status, headers, body = self.request(path)
                self.assertEqual(status, 200)
                self.assertGreater(len(body), 100)
                self.assertEqual(headers["X-Content-Type-Options"], "nosniff")

    def test_no_private_files(self):
        for path in ("/server.py", "/README.md", "/package.json", "/.git/config",
                     "/data/", "/tests/test_cases.py", "/../server.py",
                     "/data/%2e%2e/server.py", "/data/../../README.md"):
            with self.subTest(path=path):
                status, _, body = self.request(path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"import", body)

    def test_no_writes(self):
        for method in ("POST", "PUT", "DELETE"):
            with self.subTest(method=method):
                status, _, _ = self.request("/data/cases.json", method)
                self.assertEqual(status, 405)

    def test_head_has_no_response_body(self):
        status, headers, body = self.request("/app.js", "HEAD")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"")
        self.assertGreater(int(headers["Content-Length"]), 100)

    def test_unknown_path_not_routed_to_app(self):
        self.assertEqual(self.request("/case/unknown")[0], 404)


if __name__ == "__main__":
    unittest.main()
