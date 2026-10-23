import re, subprocess
from pathlib import Path
patterns=[r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{40,}',r'sk-[A-Za-z0-9]{30,}',r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----']
files=subprocess.check_output(['git','ls-files','-z']).decode().split('\0');bad=[]
for name in filter(None,files):
 path=Path(name)
 if not path.is_file():continue
 text=path.read_bytes().decode('utf-8',errors='ignore')
 if any(re.search(pattern,text) for pattern in patterns):bad.append(name)
if bad:raise SystemExit('疑似明文凭据: '+', '.join(bad))
print('已跟踪文件常见凭据模式扫描通过（不替代人工审核）')
