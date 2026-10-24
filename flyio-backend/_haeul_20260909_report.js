const fs=require('fs'),path=require('path'),assert=require('assert');const D=path.join(__dirname,'reports','haeul_intent_20260909'),read=n=>JSON.parse(fs.readFileSync(path.join(D,n+'.json')));const fmt=n=>Number(n).toLocaleString('ko-KR');
const summary=read('search_summary'),full=read('search_reports_full'),plan=read('change_plan'),state=read('apply_state'),focus=read('focus_state'),landing=read('landing_state'),campaigns=read('campaigns'),cm=new Map(campaigns.map(c=>[c.nccCampaignId,c])),groups=read('groups'),gm=new Map(groups.map(g=>[g.nccAdgroupId,g]));
const landingCheck=read('landing_restoration_check');assert(landingCheck.status==='ELIGIBLE'&&landingCheck.inspectStatus==='APPROVED');
assert(state.complete&&focus.complete);const stats=read('campaign_month'),totalClicks=stats.reduce((s,x)=>s+x.clkCnt,0),totalCost=stats.reduce((s,x)=>s+x.salesAmt,0);assert.equal(totalClicks,summary.adDetail.clicks);assert.equal(full.days.length,30);assert.equal(new Set(full.days.map(x=>x.date)).size,30);
const inv=read('inventory'),km=new Map(inv.flatMap(x=>x.keywords).map(k=>[k.nccKeywordId,k]));
const csv=(n,a)=>{const cols=Object.keys(a[0]);fs.writeFileSync(path.join(D,n+'.csv'),'\ufeff'+[cols,...a.map(r=>cols.map(k=>r[k]??''))].map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n'));};
const ad=full.adKeywords.filter(x=>x.click30>0).map(x=>({...x,keyword:km.get(x.keywordId)?.keyword||(x.keywordId==='-'?'등록키워드 미귀속':'현재 원장에 없는 키워드'),campaign:cm.get(x.cid)?.name||x.cid,group:gm.get(x.gid)?.name||x.gid,rank30:x.imp30?+(x.rankSum30/x.imp30).toFixed(2):0}));csv('전체클릭_광고상세_기기별',ad);
csv('키워드148개_입찰변경_검증결과',plan.keywords.map(k=>({키워드:k.keyword,광고그룹:gm.get(k.gid).name,기존입찰가:k.before,변경입찰가:k.after,최근7일노출:k.imp7,최근7일클릭:k.click7,최근7일평균순위:k.rank7,PC3위추정가:k.estimates.PC,모바일3위추정가:k.estimates.MOBILE,사유:k.reason,키워드ID:k.id})));
const real=full.searchTerms.filter(x=>x.cid==='cmp-a001-01-000000010949342'),rClicks=real.reduce((s,r)=>s+r.click7,0),rExp=real.filter(x=>x.matchType==='1').reduce((s,r)=>s+r.click7,0);
const beforeCore=read('core_rows'),important=['두통한의원','두통병원','두통치료','만성두통','삼차신경통','후두신경통','편두통심할때','두통심할때병원','두통병원어디로'];
const rows=important.map(kw=>{const p=plan.keywords.find(x=>x.keyword===kw),r=beforeCore.find(x=>x.keyword===kw);return `| ${kw} | ${fmt(r.impCnt||0)} | ${r.clkCnt||0} | ${r.avgRnk||'노출 없음'} | ${fmt(p.before)} → ${fmt(p.after)} |`;}).join('\n');
const budgetRows=plan.campaignBudgets.map(x=>`| ${x.name} | ${fmt(x.before)}원 | ${fmt(x.after)}원 | ${(x.after/x.before).toFixed(1)}배 |`).join('\n');
const exactClicks=read('keyword_month').reduce((s,x)=>s+x.clkCnt,0);const coverage={period:full.period,accountClicks:totalClicks,adDetailClicks:summary.adDetail.clicks,registeredKeywordClicks:exactClicks,unattributedClicks:summary.unattributedAd.clicks,searchTermClicks:summary.search.clicks,searchTermUnique:summary.uniqueClickedSearchTerms,unreportedSearchTermClicks:totalClicks-summary.search.clicks,costStats:totalCost,costAdDetail:summary.adDetail.cost,roundingDifference:summary.adDetail.cost-totalCost};fs.writeFileSync(path.join(D,'coverage_verified.json'),JSON.stringify(coverage));
const text=`해울한의원 클릭 키워드 조사 및 예산·입찰 개선 결과 — 2026-09-09

핵심 두통 검색어의 노출이 충분하지 않았고, 실수요 캠페인은 확장검색에 예산이 대부분 사용되는 구조였다. 핵심 키워드 148개, 캠페인 3개, 그룹 예산 2개를 증액하고, 증액 캠페인의 104개 그룹에서 확장검색을 해제했다. 변경 직후 API 재조회로 설정 반영을 확인했다. 향후 순위·예약·내원 증가 자체가 확인된 것은 아니다.

조사 기간은 2026-08-10~2026-09-08 30일, 최근 비교 기간은 09-02~09-08 7일이다. 계정 3442423, 캠페인 10개·그룹 4,342개를 확인하고, 클릭 발생 그룹 전체와 핵심 두통 그룹을 포함한 859개 그룹의 등록 키워드 59,599개를 조회했다. 전체 등록 키워드 원장 전수라는 뜻은 아니다. 실제 검색어·광고 상세는 30일 전 날짜의 대량 보고서를 별도로 받아 각 행의 날짜를 검증했다.

전체 ${fmt(totalClicks)}클릭이 캠페인 /stats와 AD_DETAIL 보고서에서 정확히 일치했다. /stats 비용은 ${fmt(totalCost)}원, 일별 상세 합은 ${fmt(summary.adDetail.cost)}원으로 ${fmt(summary.adDetail.cost-totalCost)}원 차이가 있다. 일별 행 합산의 반올림 차이로 구분해 보관했다.

| 확인 범위 | 결과 |
|---|---:|
| 전체 광고 클릭 | ${fmt(totalClicks)} |
| 등록 키워드 통계에 귀속된 클릭 | ${fmt(exactClicks)} |
| 등록 키워드 미귀속 클릭(플레이스 등 포함) | ${fmt(summary.unattributedAd.clicks)} |
| 실제 검색어가 제공된 클릭 | ${fmt(summary.search.clicks)} |
| 클릭 발생 실제 검색어 종류 | ${fmt(summary.uniqueClickedSearchTerms)} |
| 실제 검색어가 제공되지 않은 클릭 | ${fmt(totalClicks-summary.search.clicks)} |

등록 키워드 클릭과 실제 검색어 클릭은 겹치는 서로 다른 관점이다. 둘을 합산하지 않는다. 실제 검색어 미제공 474클릭은 플레이스 227클릭 및 나머지 검색어 미제공 지면 247클릭으로 구분된다. 제공되지 않은 검색어 이름은 알 수 없다. [네이버 검색어 보고서 제공 범위 안내](https://naver.github.io/searchad-apidoc/notice/2025/06/02/notice1/)에 따르면 검색어가 있는 검색 지면만 검색어 보고서에 제공된다.

핵심 키워드의 최근 7일 상태와 적용 입찰가:

| 키워드 | 노출 | 클릭 | 평균 노출순위 | 입찰가 변경(원) |
|---|---:|---:|---:|---:|
${rows}

순위는 /stats의 집계 평균으로 PC·모바일·지면별 모든 개별 순위를 보장하지 않는다. 예산 부족 외에 경쟁 입찰가, 검색 수요, 광고 품질도 영향을 준다. 노출 0인 키워드 전체를 예산 부족으로 단정하지 않았다. 네이버 PC·모바일 3위 추정가를 참고하되 메인 키워드 10,000원, 실수요 두통 6,000원, 연관 질환 5,000원 상한을 적용했다. 추정가가 상한보다 높은 키워드는 3위 보장을 하지 않는다.

| 캠페인 | 이전 일예산 | 변경 일예산 | 배수 |
|---|---:|---:|---:|
${budgetRows}

메인 두통 그룹 일예산도 50,000→60,000원, 어지럼증 그룹도 6,000→18,000원으로 조정했다. 계정 전체 캠페인 일예산 합계는 ${fmt(plan.previousAccountDailyCap)}→${fmt(plan.newAccountDailyCap)}원이며, 30일 단순 합산 한도는 ${fmt(plan.newAccountDailyCap*30)}원이다. 실제 지출 보장이 아닌 설정 한도다.

실수요 캠페인의 최근 7일 ${rClicks}클릭 중 ${rExp}클릭(${(rExp/rClicks*100).toFixed(1)}%)이 확장검색이었다. 실제로 저혈당·감기약·피로·타지역 병원 검색어 등이 포함됐다. 따라서 해당 캠페인 예산만 높이는 방식으로 끝내지 않고, 증액한 캠페인에서 확장검색을 사용하는 활성 그룹 104개를 모두 해제했다. 다른 캠페인은 이번 증액 대상에서 제외했다.

검색어의 '병원·치료·만성·심한·계속' 등 표현은 검색 의도를 분류하는 단서이지, 실제 환자의 통증 정도나 내원 확률을 입증하지 않는다. 질환명만 같은 타지역 병원·자가관리·약품·타 진료 목적 검색어는 별도로 검토해야 한다. 클릭 검색어 전체 CSV에는 문구 기준 분류를 담았고, 실제 증액 대상은 지역·질환 적합성·기존 상태·추정가를 추가로 검토해 선별했다. 광고 전환 기록은 전부 0이므로 실제 예약·내원 성과나 전환율이 검증됐다고 볼 수 없다.

연결 페이지: ${landing.complete?`증액한 실수요 키워드 ${landing.after.length}개의 PC·모바일 URL을 질환에 맞춰 수정하고 승인·노출 가능 상태를 확인했다.`:`두통·편두통 실수요 그룹의 기존 소재 연결 주소가 /BrainFog인 것을 발견했다. 증액 키워드 중 103개에 대한 URL 개선안을 만들었으나, 첫 변경에서 재검수가 발생해 일괄 수정을 멈췄다. 원복 요청 후 최종 재조회에서는 '두통이계속될때' 1개의 PC·모바일 홈페이지 연결이 남아 있었고 APPROVED·ELIGIBLE 및 증액 입찰가 1,120원을 확인했다. 나머지 102개는 URL 변경을 시행하지 않았다. 이는 예산·입찰·확장검색 적용 완료와 구분되는 남은 연결 페이지 개선 사항이다.`} 두통 일반은 홈페이지, 편두통은 [공식 편두통 페이지](https://haeulclinic.com/Migraine), 어지럼은 [공식 어지럼 페이지](https://haeulclinic.com/Dizziness), 긴장성 두통은 [공식 긴장성 두통 페이지](https://haeulclinic.com/Tension-TypeHeadache)를 기준으로 했다.

산출물:

- 실제검색어_클릭발생_전체_30일.csv: 클릭 발생 검색어 895개 전체.
- 실제검색어_클릭발생_전체_30일_그룹기기별.csv: 소속 그룹·기기·일치 유형을 보존한 상세.
- 클릭발생_등록키워드_전체_30일.csv: 클릭 발생 등록 키워드 208개 전체.
- 전체클릭_광고상세_기기별.csv: 검색어 미제공 클릭까지 포함한 전체 광고 클릭.
- 키워드148개_입찰변경_검증결과.csv: 키워드별 이전·이후·노출·추정가.
- coverage_verified.json: 전체 클릭 합계 대조.
- apply_state.json / focus_state.json / landing_state.json: 반영 및 검증 상태, 이전 값.

변경 이후 성과 평가는 최소 하루 집행 뒤 기기별 실제 노출·순위, 핵심어 클릭, 캠페인 소진시간으로 확인해야 한다. 실제 내원 판단에는 예약·상담·내원 집계와 광고 유입의 연결이 필요하다.
`;
fs.writeFileSync(path.join(D,'해울_두통키워드_조사및개선결과_20260909.md'),text);console.log('REPORT VERIFIED',JSON.stringify(coverage),'landing',landing.complete);
