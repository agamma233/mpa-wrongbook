import copy, tempfile, shutil, subprocess, os
from pathlib import Path
import manage as m
original=m.ROOT
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp)
 for folder in ('content','assets','web'):shutil.copytree(original/folder,root/folder)
 d=copy.deepcopy(m.load()[0]);d.update(id='9999-数学-999',year='9999',subject='数学',q=999,question_text='测试专用：1+1=?',correct='B',options=dict(zip('ABCDE',['1','2','3','4','5'])),question_image='',source='测试专用')
 (root/'content/questions/9999-数学-999.md').write_text('---\n'+m.yaml.safe_dump(d,allow_unicode=True)+'---\n')
 try:
  m.ROOT=root;m.build(local=True)
  subprocess.run([os.environ.get('NODE_BINARY','node'),str(original/'tests/smoke-built.mjs'),str(root/'dist')],check=True)
 finally:m.ROOT=original
