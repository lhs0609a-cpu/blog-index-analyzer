// 키워드 마스터 테이블 생성: kw, id, group, campaign, bid, status, userLock
const fs=require('fs');const R='reports/medilon_20260921/';
const cp=fs.readFileSync(R+'campaign.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const ag=fs.readFileSync(R+'adgroup.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const kwr=fs.readFileSync(R+'keyword.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const cpn={};for(const r of cp)cpn[r[1]]={name:r[2]};
const agm={};for(const r of ag)agm[r[1]]={cmp:r[2],name:r[3],bid:+r[4]};
const ST={'20':'ELIGIBLE','10':'UNDER_REVIEW','30':'DISAPPROVED'};
const rows=kwr.map(r=>{const g=agm[r[1]]||{};const c=cpn[g.cmp]||{};
  return {kw:r[3],id:r[2],gid:r[1],gname:g.name||'',cid:g.cmp||'',cname:c.name||'',
    bid:(+r[9]?g.bid:+r[4]),ownBid:+r[4],useGrpBid:!!+r[9],st:ST[r[8]]||r[8],lock:!!+r[7],reg:r[10]};});
fs.writeFileSync(R+'kwmaster.json',JSON.stringify(rows));
console.log('행',rows.length,'고유',new Set(rows.map(r=>r.kw)).size);
module.exports=rows;
