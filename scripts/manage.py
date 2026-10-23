import argparse, base64, hashlib, json, re, shutil
from pathlib import Path
import yaml
ROOT = Path(__file__).resolve().parents[1]
FIELDS = 'id year subject q title topic priority question_text options wrong correct brief explain lesson source confidence question_status question_image'.split()
OPTIONAL_TEXT = ('question_text', 'wrong', 'correct', 'brief', 'explain', 'lesson', 'confidence', 'question_image')
class UniqueKeyLoader(yaml.SafeLoader):
    pass

def unique_mapping(loader, node, deep=False):
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in result:
            raise ValueError(f'重复 YAML 字段: {key}')
        result[key] = loader.construct_object(value_node, deep=deep)
    return result

UniqueKeyLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, unique_mapping)

def normalize_cms(data):
    if not isinstance(data, dict):
        raise ValueError('题目 frontmatter 必须是对象')
    data = dict(data)
    for key in OPTIONAL_TEXT:
        if data.get(key) is None:
            data[key] = ''
    options = data.get('options')
    if options is None or (isinstance(options, dict) and set(options) <= set('ABCDE') and all(value is None or value == '' for value in options.values())):
        data['options'] = {}
    if data.get('image_publication') is None:
        data['image_publication'] = '未授权'
    return data

def read(path):
    text = path.read_text(encoding='utf-8')
    parts = re.split(r'^---\s*$', text, maxsplit=2, flags=re.M)
    if len(parts) != 3 or parts[0].strip(): raise ValueError(f'{path}: 无效 frontmatter')
    data = normalize_cms(yaml.load(parts[1], Loader=UniqueKeyLoader))
    if parts[2].strip(): raise ValueError(f'{path}: 请将正文写入 question_text/解析字段，避免遗漏')
    return data

def validate(rows, root=ROOT):
    ids, fingerprints = set(), set()
    for d in rows:
        if not isinstance(d, dict) or any(k not in d for k in FIELDS): raise ValueError('缺少必需字段')
        for k in FIELDS:
            if k not in ('q', 'options') and not isinstance(d[k], str): raise ValueError(f'{d.get("id")}: {k} 必须是文本')
        ident = f'{d["year"]}-{d["subject"]}-{d["q"]:02d}' if type(d['q']) is int else ''
        if d['id'] != ident or not re.fullmatch(r'[0-9]{4}(周测)?-(数学|逻辑)-[0-9]{2,3}', ident): raise ValueError('ID/年份/科目/题号不一致')
        if ident in ids: raise ValueError(f'重复 ID: {ident}')
        ids.add(ident)
        if d['subject'] not in ('数学','逻辑') or not 1 <= d['q'] <= 999: raise ValueError('科目/题号无效')
        if not isinstance(d['options'], dict) or set(d['options']) - set('ABCDE') or any(not isinstance(v,str) for v in d['options'].values()): raise ValueError('选项非法')
        if d['options'] and (set(d['options']) != set('ABCDE') or any(not v.strip() for v in d['options'].values())): raise ValueError('选项必须完整或全部留空')
        if d['correct'] not in ('','A','B','C','D','E') or (d['wrong'] not in ('','A','B','C','D','E','未保留') and not (d['id']=='2017-逻辑-40' and d['wrong']=='B（曾标C）')): raise ValueError('答案非法')
        if not d['correct'] and '待核实' not in d['question_status']: raise ValueError('未知答案必须标记待核实')
        if not d['options'] and not any(x in d['question_status'] for x in ('缺少','待补','待核实')): raise ValueError('缺失选项必须标记')
        if d.get('image_publication','未授权') not in ('未授权','已授权'): raise ValueError('图片授权状态非法')
        if d['question_image']:
            rel = Path(d['question_image'].lstrip('/'))
            if '..' in rel.parts or rel.parts[:2] != ('assets','questions') or rel.suffix.lower() not in ('.jpg','.jpeg','.png','.webp'): raise ValueError('图片路径非法')
            if not (root/rel).resolve().is_relative_to(root.resolve()) or not (root/rel).is_file(): raise ValueError(f'图片不存在或越出项目: {rel}')
        fingerprint = re.sub(r'\s+', '', d['question_text']) + json.dumps(d['options'],ensure_ascii=False,sort_keys=True)
        if fingerprint in fingerprints: raise ValueError(f'重复题目: {ident}')
        fingerprints.add(fingerprint)
    return rows

def load(root=ROOT): return validate([read(f) for f in sorted((root/'content/questions').glob('*.md'))],root)
def audit():
    source = (ROOT/'legacy/index.html').read_text()
    original = json.loads(re.search(r'<script id="records" type="application/json">(.*?)</script>', source,re.S)[1])
    current = {d['id']: d for d in load()}
    diffs=[]; images=0
    for old in original:
        d=current.get(old['id'],{})
        diffs += [f'{old["id"]}:{k}' for k,v in old.items() if k != 'question_image_data' and d.get(k) != v]
        if old['question_image_data']:
            if not d.get('question_image') or (ROOT/d['question_image']).read_bytes() != base64.b64decode(old['question_image_data'].split(',',1)[1]): diffs.append(old['id']+':image')
            images+=1
        elif d.get('question_image'): diffs.append(old['id']+':missing-image')
    if diffs: raise ValueError(f'历史字段差异: {diffs}')
    assert len(original)==40 and images==16
    print(f'历史核对通过: {len(original)} 题，{images} 张图片字节一致，24 题缺图，字段差异 0')

def build(local=False):
    rows=load(ROOT); out=ROOT/'dist'
    if out.exists(): shutil.rmtree(out)
    shutil.copytree(ROOT/'web',out)
    for d in rows:
        img=d['question_image']
        if img and (local or d.get('image_publication')=='已授权'):
            rel=img.lstrip('/'); target=out/rel; target.parent.mkdir(parents=True,exist_ok=True); shutil.copyfile(ROOT/rel,target); d['question_image']=rel
        elif img: d['question_image']=''; d['image_withheld']=True
    (out/'questions.json').write_text(json.dumps(rows,ensure_ascii=False),encoding='utf-8')
    (out/'.nojekyll').touch()
    print(f'构建完成: {len(rows)} 题；'+('本地含原图，禁止公开上传此 dist' if local else '公开模式，仅发布已授权图片'))

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('command',choices=['validate','audit','build','import']); ap.add_argument('file',nargs='?'); ap.add_argument('--apply',action='store_true'); ap.add_argument('--local-images',action='store_true'); args=ap.parse_args()
    if args.command=='validate': print(f'验证通过: {len(load())} 题')
    elif args.command=='audit': audit()
    elif args.command=='build': build(args.local_images)
    else:
        batch=json.loads(Path(args.file).read_text()); existing=load(); validate(existing+batch)
        for d in batch: print(f'{d["id"]} | {d["title"]} | {d["source"]} | {d["question_status"]}')
        if not args.apply: print('仅预览；审核确认后使用 --apply')
        else:
            for d in batch:
                with (ROOT/'content/questions'/f'{d["id"]}.md').open('x') as f: f.write('---\n'+yaml.safe_dump(d,allow_unicode=True,sort_keys=False)+'---\n')
if __name__=='__main__': main()
