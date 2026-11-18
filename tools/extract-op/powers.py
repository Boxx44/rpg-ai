import re,json
from cols import pages, split_page
L=pages()
ls=[]
for p in [124,125,126]:
    ls+= [(p,x) for x in split_page(L[p-1]) if x and not re.fullmatch(r'\d{2,3}',x)]
el=None;out=[]
for k,(p,x) in enumerate(ls):
    m=re.match(r'^PODERES DE (CONHECIMENTO|ENERGIA|MORTE|SANGUE|MEDO)$',x)
    if m: el=m.group(1).lower(); continue
    if x=='PODERES PARANORMAIS': el='geral'; continue
    if el and len(x)<32 and not x.endswith(('.',',','-',':')) and x[0].isupper() and x.upper()!=x and k+1<len(ls) and len(ls[k+1][1])>30 and (k==0 or ls[k-1][1].endswith('.') or ls[k-1][1].startswith('PODERES')):
        body=' '.join(y for _,y in ls[k+1:k+12])
        pre=re.search(r'Pré-requisitos?: ([^.]+)\.',body.split('Afinidade:')[0])
        out.append({'element':el,'name':x,'page':p,'prereq':pre.group(1) if pre else ''})
json.dump(out,open('powers.json','w'),ensure_ascii=False,indent=1)
for o in out: print(o)
