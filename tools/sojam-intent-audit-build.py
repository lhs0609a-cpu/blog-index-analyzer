import csv,json,re,sys,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];D=ROOT/'reports/sojam-20260914/intent-audit'
sys.path.insert(0,str(ROOT/'flyio-backend/scripts'))
from sojam_reset_150k_input import region_of
def read(n):return json.loads((D/n).read_text(encoding='utf8'))
def save(n,o):(D/n).write_text(json.dumps(o,ensure_ascii=False,indent=2),encoding='utf8')
def tsv(n,ncols):
    rows=list(csv.reader((D/n).open(encoding='utf8'),delimiter='\t'))
    rows=[r for r in rows if r]
    assert all(len(r)>=ncols for r in rows),(n,'invalid columns')
    return rows
AXES=[('아토피',r'아토피|태열'),('한포진',r'한포진'),('지루성·두피',r'지루|두피염|두피.*(?:가려|각질|진물)|머리.*가려|비듬'),('묘기증',r'묘기'),('은밀부위 가려움·습진',r'(?:항문|똥꼬|외음부|음부|사타구니|서혜부|음낭|고환|회음|소음순|유두).*(?:가려|간지|소양|습진|피부염|백선|진물|태선)|(?:항문|외음부|사타구니)소양'),('습진·피부염',r'습진|피부염|화폐상'),('가려움·소양',r'가려|간지|소양'),('백반증',r'백반'),('무좀·백선',r'무좀|백선|완선|어루러기'),('다한증',r'다한증'),('구순염',r'구순염|구각염|입술염'),('모낭염',r'모낭염'),('스테로이드 후유증',r'스테로이드.*(?:리바운드|부작용|중단|끊)|탈스테로이드'),('난치성 피부질환',r'양진|태선|어린선|난치성피부|자가면역.*피부'),('피부 일반',r'피부|발진')]
CARE=r'한의원|한방|한약|병원|의원|진료|상담|예약|클리닉|잘하는곳|명의|전문|치료(?!제|법|방법|하는법)|완치'
PERSIST=r'만성|재발|반복|안낫|낫지|낫질|안나아|몇년|수년|오래|계속|자꾸|난치'
PAIN=r'너무|극심|심한|심해|미치|미칠|죽겠|잠못|못자|잠을못|밤에|밤마다|야간가려|새벽|(?<!포)진물|(?<!토)(?<!두)피(?:가나|가남|가날|가흐|가맺|나고|나는|날때)|출혈|따가|쓰라|통증|아파|고통|긁어서|갈라|헐어|헐었'
INFO=r'원인|증상|사진|치료법|치료방법|치료하는법|민간요법|자가|음식|없애는법|낫는법'
DRUG=r'연고|약국|먹는약|치료제|무좀약|듀피젠트|스테로이드$|프로토픽|리도멕스|항히스타민|항생제'
PRODUCT=r'샴푸|로션|크림|비누|바디워시|보습제|스프레이|화장품|쿠팡|올리브영|영양제|유산균|세정제'
HOLD=r'두드러기|두더러기|건선|여드름|뾰루지|사마귀|곤지름|대상포진|액취증|겨드랑이냄새|주사피부염|안면홍조|주사비|종기|농양|낭종|탈모'
MEDICAL=r'봉와직염|혈관염|자반증|피부암|흑색종|천포창|경화성태선|화농성한선염|호흡곤란|괴저|포진성피부염'
def classify(k):
    k=re.sub(r'\s+','',k);axis=next((n for n,p in AXES if re.search(p,k)),None)
    care=bool(re.search(CARE,k));persist=bool(re.search(PERSIST,k));pain=bool(re.search(PAIN,k));info=bool(re.search(INFO,k));region=region_of(k)
    signals=[s for s,v in [('치료기관·치료탐색',care),('만성·재발',persist),('고통·생활불편',pain)]if v]
    if '소잠'in k:cat='브랜드';reason='소잠을 지정한 검색; 기존 환자 가능성도 있음'
    elif re.search(r'강아지|고양이|반려|간지럽히|간지럼태우|검정고시|난임|비염|성형|제모',k):cat='비대상';reason='비관련 또는 다른 진료 탐색'
    elif re.search(PRODUCT,k) and not re.search(r'부작용|접촉.*피부염|알레르기',k):cat='제품·약물정보';reason='제품 탐색'
    elif re.search(MEDICAL,k):cat='진료적합성 확인';reason='질환의 진료 적합성 확인 필요'
    elif re.search(r'눈(?:이|이가)?(?:가려|너무가려|간지)|안구|질염|구내염|설염',k):cat='진료적합성 확인';reason='피부 외 안과·구강·부인과 등 진료 가능성 확인 필요'
    elif re.search(HOLD,k):cat='기존 운영제한';reason='기존 제외·범위 제한 보존; 실제 내원 이력과는 별개'
    elif re.search(r'대학병원|세브란스|아산병원|광선치료|피부과',k):cat='타기관·치료방식';reason='특정 기관 또는 피부과·시술 탐색'
    elif re.search(DRUG,k) and not re.search(r'부작용|리바운드|중단|끊',k):cat='제품·약물정보';reason='약물·연고 정보; 내원 의도 미확인'
    elif not axis:cat='기타·미확정';reason='핵심 피부 진료 의도 미확정'
    elif region=='other':cat='타지역';reason='강남 진료권 외 지역을 지정; 내원 불가라는 뜻은 아님'
    elif care and not info:cat='치료·내원 탐색';reason='피부 질환과 치료·병원 탐색이 함께 나타남'
    elif persist or pain:cat='간절한 증상';reason='만성·재발 또는 고통 표현; 치료기관 선택은 아직 미확인'
    elif info:cat='정보 탐색';reason='원인·증상·자가관리 정보'
    else:cat='질환·증상 탐색';reason='진료 관련성이 있으나 내원 선택 의도 미확인'
    return {'category':cat,'axis':axis or '기타','signals':' / '.join(signals),'reason':reason,'region':region,'care':care,'persistent':persist,'pain':pain,'priority':cat in ['치료·내원 탐색','간절한 증상']}
def acc():return {'imp':0,'clicks':0,'cost':0,'rankSum':0,'mobileImp':0,'mobileRankSum':0,'pcImp':0,'pcRankSum':0}
def add(o,r):
    im,cl,co,rs=int(r[11]),int(r[12]),float(r[13]),float(r[14]);o['imp']+=im;o['clicks']+=cl;o['cost']+=co;o['rankSum']+=rs
    dev='mobile'if r[10]=='M'else'pc';o[dev+'Imp']+=im;o[dev+'RankSum']+=rs
def rank(o):
    o=dict(o);o['rank']=round(o['rankSum']/o['imp'],2)if o['imp']else None
    for d in ['mobile','pc']:o[d+'Rank']=round(o[d+'RankSum']/o[d+'Imp'],2)if o[d+'Imp']else None
    return o
def main():
    groups={r[1]:{'id':r[1],'cid':r[2],'name':r[3],'raw':r}for r in tsv('master_Adgroup.tsv',19)}
    kw={r[2]:{'id':r[2],'gid':r[1],'keyword':r[3],'bid':float(r[4]),'lock':r[7]=='1','useGroupBid':r[9]=='1','masterStatus':r[8],'cid':groups.get(r[1],{}).get('cid')}for r in tsv('master_Keyword.tsv',13)}
    assert all(r[0]=='1858907'for r in tsv('master_Keyword.tsv',13))
    by7=collections.defaultdict(acc);by1=collections.defaultdict(acc);daily=[]
    for day in range(7,14):
        fn=f'stat_AD_DETAIL_202609{day:02}.tsv';total=acc();rows=tsv(fn,16)
        for r in rows:
            assert r[0].replace('-','')=='202609'+str(day).zfill(2)and r[1]=='1858907',(fn,'wrong date or customer')
            add(by7[r[4]],r);add(total,r)
            if day==13:add(by1[r[4]],r)
        daily.append({'date':f'2026-09-{day:02}',**rank(total),'rows':len(rows)})
    assert daily[-1]['clicks']==79 and daily[-1]['cost']==127990 and daily[-1]['imp']==41440,'Yesterday total mismatch'
    terms=collections.defaultdict(lambda:{'imp':0,'clicks':0,'cost':0})
    for r in tsv('stat_EXPKEYWORD_20260913.tsv',12):
        assert r[0].replace('-','')=='20260913'and r[1]=='1858907'
        a=terms[r[4]];a['imp']+=int(r[8]);a['clicks']+=int(r[9]);a['cost']+=float(r[10])
    texts=collections.defaultdict(list)
    for k in kw.values():texts[k['keyword']].append(k)
    old=json.loads((ROOT/'reports/sojam-20260911/rankaudit/candidates.json').read_text(encoding='utf8'))
    oldwords={r['k']for r in old}
    universe=[];candidate_ids=[];clicks=[]
    for word,ks in texts.items():
        c=classify(word);s1=acc();s7=acc()
        for k in ks:
            for target,source in [(s1,by1[k['id']]),(s7,by7[k['id']])]:
                for key in target:target[key]+=source[key]
        r={'keyword':word,**c,'ids':[k['id']for k in ks],'registered':len(ks),'keywordOn':sum(not k['lock']for k in ks),'yesterday':rank(s1),'week':rank(s7),'historicalCandidate':word in oldwords}
        universe.append(r)
        if s1['clicks']:clicks.append(r)
        if c['priority']or word in oldwords or s1['clicks'] or c['category']=='브랜드':candidate_ids.extend(r['ids'])
    save('inventory.json',list(kw.values()));save('universe.json',universe);save('candidate_ids.json',sorted(set(candidate_ids)));save('daily_validation.json',daily)
    clicks.sort(key=lambda r:-r['yesterday']['cost']);save('clicked.json',clicks)
    ex=[{'keyword':k,**v,**classify(k)}for k,v in terms.items()if v['clicks']];save('search_terms_clicked.json',sorted(ex,key=lambda r:-r['cost']))
    selected=[r for r in universe if r['priority']or r['historicalCandidate']or r['yesterday']['clicks']]
    save('candidates.json',selected)
    # Live states: clicked IDs plus strongest symptomatic treatment queries and top recent-exposure candidates.
    statewords=set(r['keyword']for r in clicks)
    statewords.update(r['keyword']for r in sorted([r for r in universe if r['priority']],key=lambda r:(-(r['care']and(r['persistent']or r['pain'])),-r['week']['imp']))[:100])
    save('state_ids.json',[k['id']for k in kw.values()if k['keyword']in statewords])
    sums={}
    for r in clicks:
        a=sums.setdefault(r['category'],{'words':0,'clicks':0,'cost':0});a['words']+=1;a['clicks']+=r['yesterday']['clicks'];a['cost']+=r['yesterday']['cost']
    print(json.dumps({'registered':len(kw),'unique':len(universe),'priorityUnique':sum(r['priority']for r in universe),'statsIds':len(set(candidate_ids)),'clickedWords':len(clicks),'clickedByCategory':sums,'unattributedYesterday':rank(by1['-']),'searchTermTotals':{'clicks':sum(r['clicks']for r in ex),'cost':sum(r['cost']for r in ex)},'prioritySample':[{k:r[k]for k in ['keyword','category','keywordOn','week']}for r in sorted([r for r in universe if r['priority']],key=lambda r:-r['week']['imp'])[:12]]},ensure_ascii=False))
if __name__=='__main__':main()
