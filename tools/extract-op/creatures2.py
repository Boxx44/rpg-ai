import re,json,pdfplumber
pdf=pdfplumber.open('/home/claude/book/op.pdf')
def die(s):
    s=s.replace('–','-').replace(' ','')
    m=re.fullmatch(r'(-?\d*)O([+-]\d+)?',s)
    if not m: return None
    n=m.group(1) or '1'
    if n.startswith('-'): return None
    n=int(n); b=m.group(2) or ''
    return (f'{n}d20kh1' if n>1 else '1d20')+b
ELS={'SANGUE','MORTE','CONHECIMENTO','ENERGIA','MEDO'}
out=[]
for pn in range(192,304):
    p=pdf.pages[pn-1]
    words=p.extract_words(extra_attrs=['size','fontname'],keep_blank_chars=False)
    # nomes: fonte 22 Roman-New-Times; agrupar por proximidade
    nm=[w for w in words if 18<w['size']<30 and 'Roman' in w['fontname']]
    if not nm and any('FStein' in w['fontname'] and w['size']>20 for w in words):
        nm=[w for w in words if w['size']>40 and 'Roman' in w['fontname']]
    groups=[]
    for w in sorted(nm,key=lambda w:(w['top'],w['x0'])):
        g=next((g for g in groups if abs(g['x0']-w['x0'])<200 and -15<=w['top']-g['bottom']<20 or (abs(w['top']-g['top'])<3 and w['x0']-g['x1']<30)),None)
        if g: g['words'].append(w); g['bottom']=max(g['bottom'],w['bottom']); g['x1']=max(g['x1'],w['x1'])
        else: groups.append({'words':[w],'top':w['top'],'bottom':w['bottom'],'x0':w['x0'],'x1':w['x1']})
    vds=[w for w in words if ('FStein' in w['fontname'] and w['size']>20 or 'Keyes' in w['fontname'] and w['size']>20) and w['text'].isdigit()]
    lines=p.extract_text_lines(layout=False,strip=True)
    blocks=[]
    for g in groups:
        ws=sorted(g['words'],key=lambda w:(round(w['top']),w['x0']))
        tokens=[w['text'] for w in ws]
        el=None
        if tokens and tokens[-1] in ELS and len(tokens)>1: pass
        name=' '.join(tokens)
        vd=min(vds,key=lambda v:abs(v['top']-g['top'])+abs(v['x0']-g['x1'])/4,default=None)
        blocks.append({'name':name,'top':g['top'],'x0':g['x0'],'vd':int(vd['text']) if vd and abs(vd['top']-g['top'])<80 else None,'page':pn,'lines':[]})
    if not blocks: continue
    for ln in lines:
        cand=[b for b in blocks if b['top']-5<=ln['top'] and ln['x0']>=b['x0']-60]
        if not cand: continue
        b=max(cand,key=lambda b:(b['top'] if abs(ln['x0']-b['x0'])<330 else -1))
        b['lines'].append(ln['text'])
    for b in blocks:
        t='\n'.join(b['lines'])
        g=lambda r: (re.search(r,t) or [None,None])[1]
        pv=g(r'PONTOS DE VIDA\s+(\d+)'); de=g(r'DEFESA\s+(\d+)'); ini=g(r'INICIATIVA\s+([–\-]?\d*O(?:\s*[+\-–]\s*\d+)?)')
        el=next((e.lower() for e in ELS if re.search(r'(?m)^'+e+r'\b',t) or re.search(r'\b'+e+r'$',b['name'])),None)
        name=b['name']
        for e in ELS:
            if name.endswith(' '+e): name=name[:-len(e)-1]
        atks=[]
        for a in re.finditer(r'([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ ]{2,40}?)\s+(Corpo a corpo|À distância|Distância)[^\n]*?(x\d)?\s*\n(?:[^\n]*\n){0,2}?TESTE\s+(\d*O\s*[+\-–]\s*\d+)\s*\|\s*DANO\s+([0-9d+\-x ]+?)\s+([a-zà-ÿ]+)',t):
            atks.append({'name':a.group(1).strip().capitalize(),'kind':'melee' if a.group(2)=='Corpo a corpo' else 'ranged','times':int(a.group(3)[1:]) if a.group(3) else 1,'test':die(a.group(4)),'damage':a.group(5).replace(' ',''),'type':a.group(6)})
        if pv:
            out.append({'name':name.title() if name.isupper() else name,'page':pn,'vd':b['vd'],'element':el,'pv':int(pv),'defesa':int(de) if de else None,'iniciativa':die(ini) if ini else None,'attacks':atks})
json.dump(out,open('creatures_a.json','w'),ensure_ascii=False,indent=1)
print(len(out))
for o in out: print(o['page'],'|',o['name'],'| VD',o['vd'],'| PV',o['pv'],'| Def',o['defesa'],'| Ini',o['iniciativa'],'|',o['element'],'|',[(a['name'],a['times'],a['test'],a['damage'],a['type']) for a in o['attacks']])
