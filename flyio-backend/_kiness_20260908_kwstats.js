const fs=require('fs');const {req,pool}=require('./_sojam_naver');const P=n=>'_kiness_20260908_'+n+'.json';
(async()=>{
 const rows=fs.readFileSync('_kiness_20260908_parts.jsonl','utf8').trim().split('\n').map(JSON.parse),gs=JSON.parse(fs.readFileSync(P('group_month')));
 const active=new Set(gs.filter(x=>x.impCnt>0||x.salesAmt>0).map(x=>x.id));
 let saved={groups:[],data:[],errors:[]};if(fs.existsSync(P('kwstats')))saved=JSON.parse(fs.readFileSync(P('kwstats')));
 const done=new Set(saved.groups),todo=rows.filter(x=>active.has(x.gid)&&!done.has(x.gid));
 let n=0;await pool(todo,4,async x=>{
  try{const out=[];for(let i=0;i<x.keywords.length;i+=50){const ids=x.keywords.slice(i,i+50).map(k=>k.nccKeywordId);
   const r=await req('GET','/stats?ids='+encodeURIComponent(ids.join(','))+'&fields='+encodeURIComponent(JSON.stringify(['impCnt','clkCnt','salesAmt','ccnt','avgRnk']))+'&timeRange='+encodeURIComponent(JSON.stringify({since:'2026-08-09',until:'2026-09-07'})),null,441986);
   if(!Array.isArray(r?.data))throw Error('Missing stats');out.push(...r.data.filter(d=>d.impCnt>0||d.salesAmt>0||d.ccnt>0));
  }saved.data.push(...out);saved.groups.push(x.gid);
  }catch(e){saved.errors.push({gid:x.gid,error:String(e)});}
  if(++n%20===0){fs.writeFileSync(P('kwstats'),JSON.stringify(saved));console.log(n,'/',todo.length,'active keywords',saved.data.length);}
 });fs.writeFileSync(P('kwstats'),JSON.stringify(saved));
 console.log('completed',saved.groups.length,'of',active.size,'keywords',saved.data.length,'errors',saved.errors.length);
})().catch(e=>{console.error(e);process.exitCode=1});
