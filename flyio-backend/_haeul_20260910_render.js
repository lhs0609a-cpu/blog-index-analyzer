const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','haeul_20260910');
const raw=JSON.parse(fs.readFileSync(path.join(D,'raw_20260909.json')));
const cm=new Map(raw.campaigns.map(c=>[c.nccCampaignId,c]));
const csv=(n,a)=>{if(!a.length)return;const cs=Object.keys(a[0]);fs.writeFileSync(path.join(D,n+'.csv'),'﻿'+[cs,...a.map(r=>cs.map(c=>r[c]??''))].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n'));console.log('CSV',n+'.csv',a.length+'행');};
const kw=raw.clicked.map(r=>{const t=raw.kwtext[r.keywordId]||{},g=raw.groups[r.gid]||{};return{
  키워드:t.keyword||(r.keywordId==='-'?'(확장검색/키워드 미귀속)':'(삭제/조회불가)'),
  캠페인:cm.get(r.cid)?.name||r.cid,유형:cm.get(r.cid)?.campaignTp||'',그룹:g.name||r.gid,
  노출:r.imp,클릭:r.click,비용:Math.round(r.cost),CPC:Math.round(r.cost/r.click),
  CTR:+(r.click/r.imp*100).toFixed(2),평균순위:r.rankImp?+(r.rankSum/r.rankImp).toFixed(2):'',
  입찰가:t.bid??'',기기:r.devices.join('+'),keywordId:r.keywordId}})
 .sort((a,b)=>b.비용-a.비용||b.클릭-a.클릭);
csv('어제_클릭키워드_전체_20260909',kw);
const st=raw.terms.map(r=>({검색어:r.term,매칭:r.matchType,캠페인:cm.get(r.cid)?.name||r.cid,그룹:raw.groups[r.gid]?.name||r.gid,
  노출:r.imp,클릭:r.click,비용:Math.round(r.cost),CPC:Math.round(r.cost/r.click),기기:r.devices.join('+')}))
 .sort((a,b)=>b.비용-a.비용||b.클릭-a.클릭);
csv('어제_실제검색어_20260909',st);
const named=kw.filter(x=>x.keywordId!=='-'),anon=kw.filter(x=>x.keywordId==='-');
const sum=a=>a.reduce((s,x)=>({클릭:s.클릭+x.클릭,비용:s.비용+x.비용}),{클릭:0,비용:0});
console.log('\n== 어제(2026-09-09) 총계 ==',JSON.stringify(raw.adTotal));
console.log('등록키워드 귀속',JSON.stringify(sum(named)),'/ 미귀속(확장검색·플레이스)',JSON.stringify(sum(anon)));
console.log('\n== 클릭 발생 키워드 (등록키워드) ==');console.table(named.map(({keywordId,...r})=>r));
console.log('\n== 미귀속 행 ==');console.table(anon.map(({keywordId,...r})=>r));
console.log('\n== 실제 검색어(파워링크 확장검색 포함) ==');console.table(st);
