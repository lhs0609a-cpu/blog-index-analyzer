const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260922')+path.sep;
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const seeds=JSON.parse(fs.readFileSync(D+'ac_seeds.json','utf8'));
const F=D+'ac_raw.json';
const out=fs.existsSync(F)?JSON.parse(fs.readFileSync(F,'utf8')):{};
async function ac(q){
  const u='https://ac.search.naver.com/nx/ac?q='+encodeURIComponent(q)+'&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
  for(let t=0;t<3;t++){
    try{const r=await fetch(u,{headers:{'User-Agent':UA,'Referer':'https://m.search.naver.com/'},signal:AbortSignal.timeout(20000)});
      if(r.ok){const j=await r.json();return (j.items&&j.items[0]||[]).map(x=>x[0]).filter(Boolean);}}catch(e){}
    await sleep(700*(t+1));
  }
  return null;
}
(async()=>{
  const todo=seeds.filter(s=>out[s]===undefined);
  console.log('조회',todo.length,'/',seeds.length);
  let i=0,done=0,fail=0;
  await Promise.all(Array.from({length:5},async()=>{
    while(i<todo.length){
      const q=todo[i++]; const r=await ac(q);
      if(r===null){fail++;out[q]=[];}else out[q]=r;
      if(++done%300===0){fs.writeFileSync(F,JSON.stringify(out));console.log('  ',done,'/',todo.length,'실패',fail);}
      await sleep(260);
    }
  }));
  fs.writeFileSync(F,JSON.stringify(out));
  console.log('완료 실패',fail);
})().catch(e=>{console.error(e.stack);process.exitCode=1});
