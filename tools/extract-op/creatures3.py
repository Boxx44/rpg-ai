import re,json,pdfplumber
pdf=pdfplumber.open('/home/claude/book/op.pdf')
ELS=['SANGUE','MORTE','CONHECIMENTO','ENERGIA','MEDO']
def die(s):
    s=s.replace('–','-').replace(' ','')
    m=re.fullmatch(r'(\d*)O([+-]\d+)?',s)
    if not m: return None
    n=int(m.group(1) or 1); b=m.group(2) or ''
    return (f'{n}d20kh1' if n>1 else '1d20')+b
def groups_of(ws):
    nm=[w for w in ws if 18<w['size']<30 and 'Roman' in w['fontname']]
    gs=[]
    for w in sorted(nm,key=lambda w:(w['top'],w['x0'])):
        g=next((g for g in gs if abs(g['x0']-w['x0'])<120 and -15<=w['top']-g['bottom']<20 or (abs(w['top']-g['top'])<3 and 0<=w['x0']-g['x1']<30)),None)
        if g: g['w'].append(w); g['bottom']=max(g['bottom'],w['bottom']); g['x1']=max(g['x1'],w['x1'])
        else: gs.append({'w':[w],'top':w['top'],'bottom':w['bottom'],'x0':w['x0'],'x1':w['x1']})
    for g in gs: g['name']=' '.join(x['text'] for x in sorted(g['w'],key=lambda x:(round(x['top']),x['x0'])))
    return gs
def parse(text,name,pn):
    g=lambda r:(re.search(r,text) or [None,None])[1]
    pv=g(r'PONTOS DE VIDA\s+(\d+)')
    if not pv: return None
    de=g(r'DEFESA\s+(\d+)'); ini=g(r'(?:INICIATIVA|Iniciativa)\s+(\d*O(?:\s*[+\-–]\s*\d+)?)')
    vd=g(r'(?:^|\n)\s*(?:[A-ZÁÉÍÓÚÃÕÇ ]+ )?(\d{1,3})\s*\n\s*VD') or g(r'VD\s+(\d{1,3})\b') or g(r'\bVD\s*\n\s*(\d{1,3})\b') or g(r'(\d{1,3})\s*\n[^\n]*\bVD\b')
    el=None
    m=re.search(r'\bVD\b',text)
    after=text[m.end():] if m else text
    for line in after.split('\n')[:6]:
        for e in ELS:
            if re.match(r'^\s*'+e+r'\b',line): el=e.lower(); break
        if el: break
    atks=[]
    lines=text.split('\n')
    for i,l in enumerate(lines):
        m=re.search(r'([A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-ZÁÉÍÓÚÂÊÔÃÕÇ\- ]{2,40}?)\s+(Corpo a corpo|À distância)(?:\s*\([^)]*\))?(?:\s+x(\d))?',l)
        if not m: continue
        for j in range(i,min(i+3,len(lines))):
            t=re.search(r'(?:TESTE|Teste)\s+(\d*O\s*[+\-–]\s*\d+)(?:,\s*crítico\s+[0-9/x]+)?\s*\|\s*(?:DANO|Dano)\s+([0-9d+\-x ]+?)\s+([A-Za-zà-ÿ]+)',lines[j])
            if t:
                nm=m.group(1).strip()
                if nm in ('PADRÃO','AGREDIR','PADRÃO AGREDIR'): break
                nm=re.sub(r'^(PADRÃO|AGREDIR|COMPLETA)\s+','',nm)
                atks.append({'name':nm.capitalize(),'kind':'melee' if m.group(2)=='Corpo a corpo' else 'ranged','times':int(m.group(3) or 1),'test':die(t.group(1)),'damage':t.group(2).replace(' ',''),'type':t.group(3).lower()})
                break
    return {'name':name.title(),'page':pn,'vd':int(vd) if vd else None,'element':el,'pv':int(pv),'defesa':int(de) if de else None,'iniciativa':die(ini) if ini else None,'attacks':atks}
out=[]
for pn in range(192,300):
    p=pdf.pages[pn-1]
    full=p.extract_text() or ''
    if 'PONTOS DE VIDA' not in full: continue
    ws=p.extract_words(extra_attrs=['size','fontname'])
    gs=groups_of(ws)
    big=' '.join(w['text'] for w in ws if w['size']>40 and 'Roman' in w['fontname'])
    if len(gs)<=1:
        name=gs[0]['name'] if gs else big
        r=parse(full,name,pn)
        if r: out.append(r)
    else:
        W=p.width; H=p.height
        for g in gs:
            col=(0,W/2) if g['x0']<W/2-20 else (W/2,W)
            nxt=[h['top'] for h in gs if h is not g and h['top']>g['top']+5 and ((h['x0']<W/2-20)==(g['x0']<W/2-20))]
            bottom=min(nxt) if nxt else H
            crop=p.crop((col[0],max(0,g['top']-60),col[1],bottom))
            r=parse(crop.extract_text() or '',g['name'],pn)
            if r: out.append(r)
json.dump(out,open('creatures_b.json','w'),ensure_ascii=False,indent=1)
print(len(out))
for o in out: print(o['page'],'|',o['name'],'| VD',o['vd'],'| PV',o['pv'],'| Def',o['defesa'],'| Ini',o['iniciativa'],'|',o['element'],'|',[(a['name'],a['times'],a['test'],a['damage'],a['type']) for a in o['attacks']])
