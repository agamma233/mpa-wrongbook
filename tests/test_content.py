import copy, importlib.util, unittest, tempfile, shutil, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('manage',Path(__file__).resolve().parents[1]/'scripts/manage.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ContentTests(unittest.TestCase):
 def setUp(self): self.rows=m.load()
 def test_history(self): m.audit()
 def test_counts(self):
  self.assertGreaterEqual(len(self.rows),40)
  original=json.loads(m.re.search(r'<script id="records" type="application/json">(.*?)</script>',(m.ROOT/'legacy/index.html').read_text(),m.re.S)[1])
  ids={d['id'] for d in original};historic=[d for d in self.rows if d['id'] in ids]
  self.assertEqual(len(historic),40)
  self.assertEqual(sum(bool(d['question_image']) for d in historic),16)
 def test_duplicate_id(self):
  with self.assertRaises(ValueError): m.validate(self.rows+[self.rows[0]])
 def test_duplicate_question(self):
  d=copy.deepcopy(self.rows[0]);d['year']='2026';d['id']=f"2026-{d['subject']}-{d['q']:02d}"
  with self.assertRaises(ValueError):m.validate(self.rows+[d])
 def test_bad_answers(self):
  for key,value in [('correct','F'),('options',{'A':'only'}),('question_image','../../secret.png')]:
   d=copy.deepcopy(self.rows[0]);d[key]=value
   with self.assertRaises(ValueError): m.validate([d])
 def test_missing_field(self):
  d=copy.deepcopy(self.rows[0]);del d['source']
  with self.assertRaises(ValueError):m.validate([d])
 def test_cms_fields(self):
  cfg=m.yaml.safe_load((m.ROOT/'.pages.yml').read_text());fields={f['name'] for f in cfg['content'][0]['fields']}
  self.assertTrue(set(m.FIELDS)<=fields)
 def test_new_question(self):
  d=copy.deepcopy(self.rows[0]);d.update(id='9999-数学-999',year='9999',subject='数学',q=999,question_text='测试专用：1+1=?',correct='B',options=dict(zip('ABCDE',['1','2','3','4','5'])),question_image='',source='自动化测试，无真实试题')
  self.assertEqual(len(m.validate(self.rows+[d])),len(self.rows)+1)
 def test_adapted_year_id_is_preserved(self):
  d=copy.deepcopy(self.rows[0]);d.update(id='2025改编-数学-05',year='2025改编',subject='数学',q=5)
  self.assertEqual(m.validate([d])[0]['id'],'2025改编-数学-05')
 def test_unsupported_year_suffix_rejected(self):
  d=copy.deepcopy(self.rows[0]);d.update(id='2025未知-数学-05',year='2025未知',subject='数学',q=5)
  with self.assertRaises(ValueError):m.validate([d])
if __name__=='__main__':unittest.main()

class BuildTests(unittest.TestCase):
 def test_new_question_build_and_publication(self):
  original=m.ROOT
  with tempfile.TemporaryDirectory() as tmp:
   root=Path(tmp)
   for folder in ('content','assets','web'):shutil.copytree(original/folder,root/folder)
   for file in (root/'content/questions').glob('*.md'):
    row=m.read(file);row['image_publication']='未授权';file.write_text('---\n'+m.yaml.safe_dump(row,allow_unicode=True)+'---\n')
   d=copy.deepcopy(m.load()[0]);d.update(id='9999-数学-999',year='9999',subject='数学',q=999,question_text='测试专用：1+1=?',correct='B',options=dict(zip('ABCDE',['1','2','3','4','5'])),question_image='',source='自动化测试，无真实试题')
   (root/'content/questions/9999-数学-999.md').write_text('---\n'+m.yaml.safe_dump(d,allow_unicode=True)+'---\n')
   try:
    m.ROOT=root;m.build();rows=json.loads((root/'dist/questions.json').read_text());self.assertEqual(len(rows),len(m.load(original))+1);self.assertTrue(any(x['id']==d['id'] for x in rows));self.assertFalse((root/'dist/legacy').exists());self.assertEqual(len(list((root/'dist').rglob('*.jpg'))),0)
   finally:m.ROOT=original

class CmsCompatibilityTests(unittest.TestCase):
 def test_empty_optional_fields(self):
  d=copy.deepcopy(m.load()[0]);d.update(options={k:None for k in 'ABCDE'},correct=None,wrong=None,question_image=None,question_status='待核实；待补原卷')
  for key in ('brief','explain','lesson','confidence'):d.pop(key)
  result=m.normalize_cms(d)
  m.validate([result]);self.assertEqual(result['options'],{});self.assertEqual(result['correct'],'');self.assertEqual(result['brief'],'')
 def test_partial_options_still_fail(self):
  d=copy.deepcopy(m.load()[0]);d['options']={'A':'已知','B':None}
  with self.assertRaises(ValueError):m.validate([m.normalize_cms(d)])
 def test_required_source_still_required(self):
  d=copy.deepcopy(m.load()[0]);d.pop('source')
  with self.assertRaises(ValueError):m.validate([m.normalize_cms(d)])
 def test_duplicate_yaml_keys_fail(self):
  with self.assertRaises(ValueError):m.yaml.load('correct: A\ncorrect: B\n',Loader=m.UniqueKeyLoader)
