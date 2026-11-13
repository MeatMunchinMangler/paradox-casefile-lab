"""Offline fail-closed unit checks for pinned public game ZIP generation."""
import io
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from itch_export import ASSETS, blob_id, verified_assets, zip_bytes, export


class ItchExportTests(unittest.TestCase):
    def test_known_git_blob_hash(self):
        self.assertEqual(blob_id(b"test content\n"), "d670460b4b4aece5915caf5c68d12f560a9fe3e4")

    def test_reproducible_archive(self):
        files = {'index.html': b'<h1>test</h1>', 'data/cases.json': b'[]'}
        self.assertEqual(zip_bytes(files), zip_bytes(files))
        with ZipFile(io.BytesIO(zip_bytes(files))) as z:
            self.assertEqual(z.namelist(), sorted(files))
            for name, data in files.items():
                self.assertEqual(z.read(name), data)

    def test_parent_directory_not_allowed(self):
        with self.assertRaisesRegex(ValueError, 'Unsafe archive path'):
            zip_bytes({'../outside.txt': b'bad'})

    def test_malformed_local_tree_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError, 'Invalid, missing'):
                verified_assets(Path(d))

    def test_symlink_source_blocked(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / 'app.js').symlink_to('/etc/hosts')
            with self.assertRaisesRegex(ValueError, 'linked asset'):
                verified_assets(root)

    def test_existing_destination_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / 'existing.zip'
            dest.write_bytes(b'original')
            with self.assertRaises(FileExistsError):
                export(Path(d), dest)
            self.assertEqual(dest.read_bytes(), b'original')

    def test_expected_allowlist(self):
        self.assertEqual(len(ASSETS), 7)
        self.assertIn('index.html', ASSETS)
        self.assertIn('data/cases.json', ASSETS)


if __name__ == '__main__':
    unittest.main()
