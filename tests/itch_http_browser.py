#!/usr/bin/env python3
"""Real Chrome HTTP+iframe game smoke. Never uploads, deploys, or posts."""
from __future__ import annotations
import argparse
from functools import partial
from html.parser import HTMLParser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from itch_export import verified_assets


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


class ReportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.status = None
        self.data = ""
        self.in_report = False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "pre" and a.get("id") == "report":
            self.status = a.get("data-status")
            self.in_report = True

    def handle_endtag(self, tag):
        if tag == "pre":
            self.in_report = False

    def handle_data(self, text):
        if self.in_report:
            self.data += text


def fixture(case_id, answer, wrong):
    config = json.dumps({"caseId": case_id, "answer": answer, "wrong": wrong})
    html = """<!doctype html><html lang="en"><head><meta charset="utf-8">
    <title>PARADOX local HTTP iframe test</title></head><body>
    <iframe id="game" src="/?case=" title="PARADOX embedded game"
      sandbox="allow-scripts allow-same-origin"></iframe>
    <pre id="report" data-status="PENDING">Pending</pre>
    <script>
    const config = __CONFIG__;
    const report = document.getElementById("report");
    const frame = document.getElementById("game");
    let completed = false;
    function finish(status, checks, message) {
      if (completed) return;
      completed = true;
      report.setAttribute("data-status", status);
      report.textContent = JSON.stringify({status,checks,message});
    }
    function check(condition, description, checks) {
      if (!condition) throw new Error(description);
      checks.push(description);
    }
    function run() {
      if (completed) return;
      const doc = frame.contentDocument;
      if (!doc || doc.querySelectorAll("button.clue-card").length !== 6) {
        setTimeout(run, 50);
        return;
      }
      const checks = [];
      try {
        check(doc.querySelectorAll("#case-list button.case-item").length === 12,
          "twelve real HTTP cases", checks);
        check(doc.querySelectorAll("button.clue-card").length === 6,
          "six rendered evidence cards", checks);
        check(doc.getElementById("case-title").textContent.length > 3,
          "case title is loaded", checks);
        function choose(id) {
          const node = doc.querySelector("button.clue-card[data-clue='" + id + "']");
          if (!node) throw new Error("missing evidence " + id);
          node.click();
        }
        config.wrong.forEach(choose);
        check(!doc.getElementById("submit-button").disabled,
          "wrong pair can be submitted", checks);
        doc.getElementById("submit-button").click();
        check(doc.getElementById("dock-status").textContent.includes("Verdict rejected"),
          "wrong verdict rejected", checks);
        config.answer.forEach(choose);
        doc.getElementById("submit-button").click();
        check(doc.getElementById("result-dialog").open,
          "correct answer opens result dialog", checks);
        check(doc.getElementById("result-stats").textContent.includes("VERDICTS"),
          "score shows number of attempts", checks);
        const saved = JSON.parse(frame.contentWindow.localStorage.getItem(
          "paradox-casefile-progress-v1"));
        check(saved.solved[config.caseId].solved === true,
          "progress stored by actual browser", checks);
        doc.getElementById("next-button").click();
        check(!doc.getElementById("result-dialog").open,
          "next case closes result dialog", checks);
        check(doc.querySelectorAll("button.clue-card").length === 6,
          "next case renders six evidence cards", checks);
        finish("PASS", checks, "Real local HTTP/iframe mystery playthrough passed");
      } catch (error) {
        finish("FAIL", checks, String(error.stack || error));
      }
    }
    frame.addEventListener("load", () => setTimeout(run, 75));
    frame.src = "/?case=" + encodeURIComponent(config.caseId);
    setTimeout(() => finish("FAIL", [], "case load timed out"), 4000);
    </script></body></html>"""
    return html.replace("__CONFIG__", config)


def verify_http_browser(root, chrome=None):
    assets = verified_assets(root)
    cases = json.loads(assets["data/cases.json"])
    case = cases[0]
    wrong = [x["id"] for x in case["clues"] if x["id"] not in case["answer"]][:2]
    assert len(wrong) == 2
    chrome = chrome or next((v for n in ("google-chrome", "chromium", "chromium-browser")
                             if (v := shutil.which(n))), None)
    if not chrome:
        raise RuntimeError("Chrome or Chromium is required for the browser acceptance")
    with tempfile.TemporaryDirectory(prefix="paradox-itch-http-") as temp:
        directory = Path(temp)
        for path, blob in assets.items():
            target = directory / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(blob)
        (directory / "iframe-smoke.html").write_text(
            fixture(case["id"], case["answer"], wrong), encoding="utf-8")
        server = ThreadingHTTPServer(("127.0.0.1", 0),
                                     partial(QuietHandler, directory=str(directory)))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        origin = "http://127.0.0.1:" + str(server.server_address[1])
        try:
            for asset in ("app.js", "data/cases.json"):
                with urllib.request.urlopen(origin + "/" + asset, timeout=6) as response:
                    assert response.status == 200 and response.read() == assets[asset]
            args = [
                chrome, "--headless=new", "--no-sandbox", "--disable-gpu",
                "--disable-dev-shm-usage", "--disable-background-networking",
                "--disable-extensions", "--no-first-run", "--no-default-browser-check",
                "--virtual-time-budget=5000", "--dump-dom",
                "--user-data-dir=" + str(directory / "chrome-profile"),
                origin + "/iframe-smoke.html",
            ]
            result = subprocess.run(args, capture_output=True, text=True, timeout=35)
            if result.returncode:
                raise AssertionError("Chrome failed: " + result.stderr[-1400:])
            parser = ReportParser()
            parser.feed(result.stdout)
            if parser.status != "PASS":
                raise AssertionError("Chrome HTTP iframe failed: " + parser.data[-1400:]
                                     + "\n" + result.stderr[-600:])
            receipt = json.loads(parser.data)
            assert receipt["status"] == "PASS" and len(receipt["checks"]) == 10
            return {
                "status": "PASS",
                "checks": receipt["checks"],
                "real_http_assets": ["app.js", "data/cases.json"],
                "source_case_count": len(cases),
                "local_embedded_iframe": True,
                "actual_itch_io_iframe_tested": False,
            }
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=3)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=Path("."))
    parser.add_argument("--chrome", default=None)
    options = parser.parse_args()
    print(json.dumps(verify_http_browser(options.source_dir, options.chrome), indent=2))
