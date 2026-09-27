const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260917');const CID=441986;
(async()=>{
 const flat=JSON.parse(fs.readFileSync(path.join(D,'keywords_flat.json')));
 const st=new Map();
 for(const l of fs.readFileSync(path.join(D,'kwstats7.jsonl'),'utf8').split('\n')){if(!l.trim())continue;const o=JSON.parse(l);st.set(o.id,o);}
 const rows=flat.map(k=>({...k,...(st.get(k.id)||{i:0,c:0,s:0,r:0})})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
 console.log('7일 비용발생 인스턴스',rows.length,'총',rows.reduce((a,x)=>a+x.s,0));
 const top=rows.slice(0,30);
 const est=await pool(top,3,async k=>{
  try{const r=await req('GET','/estimate/average-position-bid/keyword',null,CID,2);return null;}catch(e){return null;}
 });
 // 순위별 추정입찰가
 const body={device:'PC',keywordplus:false,key:'',items:top.map(k=>({key:k.kw,position:1}))};
 let p1=null,p2=null,p3=null;
 try{p1=await req('POST','/estimate/average-position-bid/keyword',{device:'PC',items:top.map(k=>({key:k.kw,position:1}))},CID,2);}catch(e){console.log('est1 err',String(e).slice(0,150));}
 try{p3=await req('POST','/estimate/average-position-bid/keyword',{device:'PC',items:top.map(k=>({key:k.kw,position:3}))},CID,2);}catch(e){}
 const m1=new Map((p1?.estimate||[]).map(x=>[x.keyword,x.bid])),m3=new Map((p3?.estimate||[]).map(x=>[x.keyword,x.bid]));
 console.log('키워드\t7일비용\t클릭\t노출\t평균순위\t현재입찰\tPC1위추정\tPC3위추정\t그룹');
 const groups=JSON.parse(fs.readFileSync(path.join(D,'groups.json')));const gm=new Map(groups.map(g=>[g.nccAdgroupId,g.name]));
 for(const k of top)console.log([k.kw,k.s,k.c,k.i,k.r?k.r.toFixed(1):'-',k.bid,m1.get(k.kw)??'-',m3.get(k.kw)??'-',gm.get(k.gid)].join('\t'));
 fs.writeFileSync(path.join(D,'head30.json'),JSON.stringify(top.map(k=>({...k,est1:m1.get(k.kw)??null,est3:m3.get(k.kw)??null,grp:gm.get(k.gid)}))));
})().catch(e=>{console.error(e);process.exitCode=1});
