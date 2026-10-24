const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260921');const CID=441986;
const rd=f=>fs.readFileSync(path.join(D,f),'utf8');
(async()=>{
 const camps=JSON.parse(rd('campaigns.json'));const cm=new Map(camps.map(c=>[c.nccCampaignId,c]));
 // AD_DETAIL: 0 날짜 1 cid 2 캠페인 3 그룹 4 키워드 5 소재 6 비즈채널 7 시각 8 지역 9 매체 10 기기 11 노출 12 클릭 13 비용 14 순위합
 const byKw=new Map(), hr={}, tot={i:0,c:0,s:0};
 for(const l of rd('AD_DETAIL.tsv').split('\n')){if(!l.trim())continue;const f=l.split('\t');
  const i=+f[11],c=+f[12],s=+f[13],rk=+f[14],h=+f[7];
  tot.i+=i;tot.c+=c;tot.s+=s;
  hr[h]=hr[h]||{i:0,c:0,s:0};hr[h].i+=i;hr[h].c+=c;hr[h].s+=s;
  const k=f[4];
  if(!byKw.has(k))byKw.set(k,{id:k,cid:f[2],gid:f[3],i:0,c:0,s:0,rk:0,dev:{}});
  const o=byKw.get(k);o.i+=i;o.c+=c;o.s+=s;o.rk+=rk;o.dev[f[10]]=(o.dev[f[10]]||0)+c;
 }
 console.log('AD_DETAIL 합계 비용',tot.s,'클릭',tot.c,'노출',tot.i);
 const clicked=[...byKw.values()].filter(x=>x.c>0).sort((a,b)=>b.s-a.s);
 const ids=clicked.map(x=>x.id).filter(x=>x!=='-');
 const chunks=[];for(let i=0;i<ids.length;i+=100)chunks.push(ids.slice(i,i+100));
 const kres=await pool(chunks,4,ids=>req('GET','/ncc/keywords?ids='+encodeURIComponent(ids.join(',')),null,CID,4));
 const km=new Map();for(const r of kres) if(Array.isArray(r)) for(const k of r) km.set(k.nccKeywordId,k);
 const gids=[...new Set(clicked.map(x=>x.gid))];
 const gres=await pool(gids,6,gid=>req('GET','/ncc/adgroups/'+gid,null,CID,4));
 const gm=new Map();for(const g of gres) if(g&&g.nccAdgroupId) gm.set(g.nccAdgroupId,g);
 const rows=clicked.map(x=>{const k=km.get(x.id),g=gm.get(x.gid),c=cm.get(x.cid);
  return {kw:k?k.keyword:(x.id==='-'?'(키워드없음/확장)':x.id),cost:x.s,clicks:x.c,imps:x.i,
   cpc:x.c?Math.round(x.s/x.c):0,avgRnk:x.i?+(x.rk/x.i).toFixed(1):'',
   bid:k?(k.useGroupBidAmt?g?.bidAmt:k.bidAmt):'',useGrpBid:k?!!k.useGroupBidAmt:'',
   st:k?k.status:'',qi:k?k.qualityIndex:'',camp:c?.name||x.cid,grp:g?.name||x.gid,
   dev:Object.entries(x.dev).filter(([,v])=>v>0).map(([d,v])=>d+':'+v).join(' '),kid:x.id};});
 fs.writeFileSync(path.join(D,'clicked.json'),JSON.stringify(rows,null,1));
 fs.writeFileSync(path.join(D,'hourly.json'),JSON.stringify(hr));
 console.log('\n=== 어제(09-20) 클릭 발생 등록키워드',rows.length,'개 ===');
 console.log('비용\t클릭\tCPC\t노출\t평균순위\t입찰\t품질\t키워드\t캠페인');
 for(const r of rows) console.log([r.cost,r.clicks,r.cpc,r.imps,r.avgRnk,r.bid,r.qi,r.kw,r.camp].join('\t'));
 console.log('\n=== 시간대별 소진 ===');
 let cum=0;for(let h=0;h<24;h++){const x=hr[h]||{i:0,c:0,s:0};if(!x.i&&!x.s)continue;cum+=x.s;console.log(h+'시\t노출'+x.i+'\t클릭'+x.c+'\t비용'+x.s+'\t누적'+cum+'\t'+(cum/200000*100).toFixed(1)+'%');}
 // 실제 검색어
 const se=new Map();
 for(const l of rd('EXPKEYWORD.tsv').split('\n')){if(!l.trim())continue;const f=l.split('\t');
  const q=f[4],i=+f[8],c=+f[9],s=+f[10];
  if(!se.has(q))se.set(q,{q,i:0,c:0,s:0});const o=se.get(q);o.i+=i;o.c+=c;o.s+=s;}
 const sec=[...se.values()].filter(x=>x.c>0).sort((a,b)=>b.s-a.s);
 fs.writeFileSync(path.join(D,'search_terms.json'),JSON.stringify(sec,null,1));
 console.log('\n=== 어제 클릭된 실제 검색어',sec.length,'개 (검색어 전체',se.size,') ===');
 console.log('비용\t클릭\t노출\t검색어');
 for(const r of sec) console.log([r.s,r.c,r.i,r.q].join('\t'));
})().catch(e=>{console.error(e);process.exitCode=1});
