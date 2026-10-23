import unittest, re, json, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class PwaBuildTests(unittest.TestCase):
 def test_vendor_budget_and_fonts(self):
  root=ROOT/'web/vendor/katex'
  self.assertLessEqual(sum(f.stat().st_size for f in root.rglob('*') if f.is_file()),2975015*.4)
  self.assertTrue((root/'LICENSE').is_file())
  self.assertEqual(len(list((root/'fonts').glob('*.woff2'))),20)
  self.assertEqual({f.suffix for f in (root/'fonts').iterdir() if f.is_file()},{'.woff2'})
  css=(root/'katex.min.css').read_text()
  for rel in re.findall(r'url\(([^)]+)\)',css):self.assertTrue((root/rel).is_file(),rel)
  self.assertNotIn('.ttf',css);self.assertNotIn('.woff)',css)
 def test_manifest_subpath(self):
  m=json.loads((ROOT/'web/manifest.webmanifest').read_text())
  self.assertEqual(m['start_url'],'./');self.assertEqual(m['scope'],'./')
  self.assertEqual({i['sizes'] for i in m['icons']},{'192x192','512x512'})
  self.assertTrue(any(i['purpose']=='maskable' for i in m['icons']))
  for i in m['icons']:self.assertTrue((ROOT/'web'/i['src']).is_file())
