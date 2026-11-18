import re
def split_page(page):
    lines=page.split('\n')
    best=None;bc=0
    for c in range(40,90):
        ok=sum(1 for l in lines if len(l)<=c or l[c-1]==' ' and (c<2 or l[c-2]==' ' or l[c-1]==' '))
        right=sum(1 for l in lines if len(l)>c and l[c:].strip())
        if right<5: continue
        # boundary should have blank at c-1 for almost all lines
        blanks=sum(1 for l in lines if len(l)<=c or l[c-1]==' ')
        if blanks>bc: bc=blanks;best=c
    if best is None: return [l.strip() for l in lines]
    # refine: move left while column still blank
    left=[];right=[]
    for l in lines:
        left.append(l[:best].strip()); right.append(l[best:].strip() if len(l)>best else '')
    return left+right
def pages(path='/home/claude/book/op.txt'):
    return open(path).read().replace('\u00ad','').split('\f')
