import re, json
from cols import pages, split_page
L=pages()
def lines(a,b):
    out=[]
    for i in range(a-1,b):
        for x in split_page(L[i]):
            if x and not re.fullmatch(r'\d{2,3}',x): out.append((i+1,x))
    return out
CLASSES={'combatente':(34,37),'especialista':(38,41),'ocultista':(42,45)}
result={}
for cls,(a,b) in CLASSES.items():
    ls=lines(a,b)
    # progressão
    prog=[]
    raw=L[a]  # tabela na pagina a+1 (layout)
    for i in range(a-1,b):
        for m in re.finditer(r'(\d{1,2})%\s{2,}([A-ZÁÉÍÓÚ][^\n]+?)\s*$',L[i],re.M):
            prog.append({'nex':int(m.group(1)),'features':m.group(2).strip()})
    # poderes de classe: "b   Nome." até trilhas
    powers=[];trails=[]
    text_after_trails=False;cur_trail=None
    for k,(p,x) in enumerate(ls):
        if x.startswith('TRILHAS DE'): text_after_trails=True
        m=re.match(r'^b\s+([A-ZÁÉÍÓÚ][\wÀ-ÿ’\' ]{2,40})\.',x)
        if m and not text_after_trails:
            body=' '.join(y for _,y in ls[k:k+14])
            body=re.sub(r'(\w)- (\w)',r'\1\2',body)
            pre=re.search(r'Pré-requisitos?: ([^.]+)\.',body.split(' b ')[0] if ' b ' in body else body)
            seg=body
            nxt=re.search(r' b\s+[A-ZÁÉÍÓÚ]',body[3:])
            if nxt: seg=body[:nxt.start()+3]
            pre=re.search(r'Pré-requisitos?: ([^.]+)\.',seg)
            powers.append({'name':m.group(1).strip(),'page':p,'prereq':pre.group(1).strip() if pre else ''})
        m=re.match(r'^NEX (\d+)% - ([^.]+)\.',x)
        if m and text_after_trails:
            if int(m.group(1))==10:
                j=k-1
                while j>0:
                    y=ls[j][1]
                    if len(y)<40 and '.' not in y and y[0].isupper() and not y.startswith('NEX') and y.upper()!=y and len(y.split())<=4 and not y.endswith('-'):
                        break
                    j-=1
                cur_trail={'name':ls[j][1],'page':ls[j][0],'abilities':[]}
                trails.append(cur_trail)
            cur_trail['abilities'].append({'nex':int(m.group(1)),'name':m.group(2).strip(),'page':p})
    result[cls]={'progression':prog,'powers':powers,'trails':trails}
json.dump(result,open('classes.json','w'),ensure_ascii=False,indent=1)
for c,v in result.items():
    print('==',c,len(v['progression']),'nex rows;',len(v['powers']),'powers;',[ (t['name'],len(t['abilities'])) for t in v['trails']])
    print([ (x['nex'],x['features']) for x in v['progression']][:22])
    print([ (x['name'],x['prereq']) for x in v['powers']])
