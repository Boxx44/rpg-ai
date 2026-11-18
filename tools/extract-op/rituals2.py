import re, json
from cols import split_page, pages
L=pages()
lines=[]
for i in range(133,153):
    for ln in split_page(L[i]):
        if ln and not re.fullmatch(r'\d{2,3}',ln) and ln!='DESCRIÇÃO DOS RITUAIS': lines.append((i+1,ln))
ELRE=re.compile(r'^((?:(?:CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)\s+\d\s*)+)$')
heads=[k for k in range(len(lines)-1) if ELRE.match(lines[k+1][1]) and not ELRE.match(lines[k][1])]
FIELDS={'Execução':'execution','Alcance':'range','Alvos?':'target','Área':'area','Efeito':'effect','Duração':'duration','Resistência':'resistance'}
out=[]
for n,k in enumerate(heads):
    end=heads[n+1] if n+1<len(heads) else len(lines)
    name=lines[k][1]; page=lines[k][0]
    els=re.findall(r'(CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)\s+(\d)',lines[k+1][1])
    body=[l for _,l in lines[k+2:end]]
    text=re.sub(r'(\w)-\n(\w)',r'\1\2','\n'.join(body))
    r={'name':name,'page':page,'elements':[e.lower() for e,_ in els],'circle':int(els[0][1])}
    # campos: linha "Campo: valor" com possível continuação em minúscula
    tl=text.split('\n')
    for i,ln in enumerate(tl):
        for lab,key in FIELDS.items():
            m=re.match(r'^('+lab+r'): (.+)$',ln)
            if m and key not in r:
                v=m.group(2)
                j=i+1
                while j<len(tl) and tl[j] and (tl[j][0].islower() or tl[j][0] in '(0123456789') and ':' not in tl[j][:14] and len(tl[j])<40:
                    v+=' '+tl[j]; j+=1
                r[key]=' '.join(v.split())
    m=re.search(r'Discente \(\+ ?(\d+) PE\)',text); r['discente']=int(m.group(1)) if m else None
    m=re.search(r'Verdadeiro \(\+ ?(\d+) PE\)',text); r['verdadeiro']=int(m.group(1)) if m else None
    basic=' '.join(re.split(r'Discente \(|Verdadeiro \(',text)[0].split())
    dm=re.search(r'(\d+d\d+(?:\s*\+\s*\d+)?)\s+(?:pontos\s+)?de\s+dano(?:\s+(?:de\s+)?([A-Za-zçãéíô]+))?',basic)
    hm=re.search(r'recupera\w*\s+(\d+d\d+(?:\s*\+\s*\d+)?)\s+(?:pontos de vida|PV)',basic)
    if dm: r['damage']={'dice':dm.group(1).replace(' ',''),'type':(dm.group(2) or '').lower()}
    if hm: r['heal']=hm.group(1).replace(' ','')
    out.append(r)
json.dump(out,open('rituals.json','w'),ensure_ascii=False,indent=1)
print(len(out))
for r in out:
    miss=[f for f in ['execution','range','duration'] if f not in r]
    print(r['circle'],r['elements'],r['name'],'| p',r['page'],'|',r.get('execution'),'|',r.get('range'),'|',r.get('duration'),'|',r.get('resistance',''),'|',r.get('discente'),r.get('verdadeiro'),'|',r.get('damage',''),r.get('heal',''), 'FALTA' if miss else '')
