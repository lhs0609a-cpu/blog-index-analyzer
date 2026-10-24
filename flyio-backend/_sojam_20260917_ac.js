// 네이버 자동완성 전수 수집 → 등록 키워드와 대조 (2026-09-17)
// 연관검색어 블록은 현재 SERP HTML 에 렌더링되지 않아 자동완성을 실제 수요 검증기로 쓴다 [[keyword-discovery-validation]]
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'../reports/sojam-20260917/');
const J=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const seeds=J(D+'ac_seeds.json');
const F=D+'ac_raw.json';
const out=fs.existsSync(F)?J(F):{};
async function ac(q){
  const u='https://ac.search.naver.com/nx/ac?q='+encodeURIComponent(q)+'&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
  for(let t=0;t<3;t++){
    try{const r=await fetch(u,{headers:{'User-Agent':UA,'Referer':'https://m.search.naver.com/'},signal:AbortSignal.timeout(20000)});
      if(r.ok){const j=await r.json();return (j.items&&j.items[0]||[]).map(x=>x[0]).filter(Boolean);}}catch(e){}
    await sleep(800*(t+1));
  }
  return null;
}
(async()=>{
  const todo=seeds.filter(s=>out[s]===undefined);
  console.error('자동완성 조회',todo.length,'/',seeds.length);
  let i=0,done=0,fail=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(i<todo.length){
      const q=todo[i++];
      const r=await ac(q);
      if(r===null){fail++;out[q]=[];}else out[q]=r;
      if(++done%100===0){fs.writeFileSync(F,JSON.stringify(out));console.error('  ',done,'/',todo.length,'실패',fail);}
      await sleep(320);
    }
  }));
  fs.writeFileSync(F,JSON.stringify(out));
  console.error('완료 · 실패',fail);
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
