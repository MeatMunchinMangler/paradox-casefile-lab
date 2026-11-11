"""Independent structural checks of 12 original mystery cards."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((ROOT / "data" / "cases.json").read_text(encoding="utf-8"))


class CaseLibraryTests(unittest.TestCase):
    def test_twelve_original_cases(self):
        self.assertEqual(len(CASES), 12)
        self.assertEqual(len({c["id"] for c in CASES}), 12)

    def test_case_ids_are_stable_url_segments(self):
        for c in CASES:
            with self.subTest(case=c["id"]):
                self.assertRegex(c["id"], r"^[a-z0-9-]{4,42}$")
                self.assertNotIn("..", c["id"])

    def test_each_case_has_six_unique_evidence_cards(self):
        for c in CASES:
            with self.subTest(case=c["id"]):
                cards = c["clues"]
                self.assertEqual(len(cards), 6)
                self.assertEqual([x["id"] for x in cards], list("ABCDEF"))
                for x in cards:
                    self.assertTrue(3 <= len(x["tag"]) <= 25)
                    self.assertTrue(24 <= len(x["text"]) <= 400)

    def test_one_explicit_correct_pair(self):
        for c in CASES:
            with self.subTest(case=c["id"]):
                answer = c["answer"]
                self.assertEqual(len(answer), 2)
                self.assertEqual(len(set(answer)), 2)
                self.assertTrue(set(answer) <= {x["id"] for x in c["clues"]})
                self.assertTrue(len(c["why"]) >= 65)

    def test_hints_and_editorial_context(self):
        for c in CASES:
            with self.subTest(case=c["id"]):
                self.assertEqual(len(c["hints"]), 2)
                self.assertTrue(all(15 < len(x) < 180 for x in c["hints"]))
                self.assertTrue(len(c["scene"]) >= 50)
                self.assertTrue(len(c["hook"]) >= 20)
                self.assertIn(c["difficulty"], {"rookie", "agent", "detective"})

    def test_no_real_people_or_fake_citations(self):
        content = json.dumps(CASES).lower()
        self.assertNotIn("source:", content)
        self.assertNotIn("http", content)
        self.assertNotIn("real patient", content)
        self.assertNotIn("confirmed by nypd", content)

    def test_puzzle_order_mix(self):
        positions = {tuple(sorted(c["answer"])) for c in CASES}
        self.assertGreaterEqual(len(positions), 7, "Avoid obvious repeated pair patterns")
        self.assertGreaterEqual(len({c["difficulty"] for c in CASES}), 3)

    def test_user_progress_is_not_shipped(self):
        for name in ("data/cases.json", "index.html", "app.js"):
            content = (ROOT / name).read_text(encoding="utf-8")
            self.assertNotIn("sk-proj-", content)
            self.assertNotIn("INSERT INTO", content)
        self.assertNotIn("POST", (ROOT / "app.js").read_text())


if __name__ == "__main__":
    unittest.main()
