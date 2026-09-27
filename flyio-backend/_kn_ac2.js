const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260922')+path.sep;
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const F=D+'ac_raw2.jsonl';
const seeds=JSON.parse(fs.readFileSync(D+'ac_seeds2.json','utf8'));
const done=new Set();
if(fs.existsSync(F)) for(const l of fs.readFileSync(F,'utf8').split('\n')) if(l.trim()){try{done.add(JSON.parse(l).q)}catch(e){}}
async function ac(q){
  const u='https://ac.search.naver.com/nx/ac?q='+encodeURIComponent(q)+'&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
  for(let t=0;t<2;t++){
    try{const r=await fetch(u,{headers:{'User-Agent':UA,'Referer':'https://m.search.naver.com/'},signal:AbortSignal.timeout(15000)});
      if(r.ok){const j=await r.json();return (j.items&&j.items[0]||[]).map(x=>x[0]).filter(Boolean);}}catch(e){}
    await sleep(600*(t+1));
  }
  return null;
}
(async()=>{
  const LIM=parseInt(process.argv[2]||'0',10);let todo=seeds.filter(s=>!done.has(s));if(LIM)todo=todo.slice(0,LIM);
  console.log('조회',todo.length,'/',seeds.length,'(완료',done.size,')');
  const fd=fs.openSync(F,'a');
  let i=0,n=0,fail=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(i<todo.length){
      const q=todo[i++]; const r=await ac(q);
      if(r===null) fail++;
      // 지명 후보만 남겨 메모리·용량 절감
      const keep=(r||[]).filter(x=>/^[가-힣]{2,12}( |$)/.test(x)).slice(0,10);
      fs.writeSync(fd,JSON.stringify({q,r:keep})+'\n');
      if(++n%2000===0) console.log('  ',n,'/',todo.length,'실패',fail);
      await sleep(200);
    }
  }));
  fs.closeSync(fd);
  console.log('완료 실패',fail);
})().catch(e=>{console.error(e.message);process.exitCode=1});
