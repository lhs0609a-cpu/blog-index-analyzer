// 키네스 파워링크 실순위 일괄 측정.
// 순위는 li 순서가 아니라 onclick 안의 r=<순위> 값이다.
// 대조군 '키네스'를 주기적으로 끼워 측정 자체가 깨졌는지 확인한다.
const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260923');
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MUA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const TARGET=/kiness/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const IN=process.argv[2], OUT=path.join(D,process.argv[3]||'serp_live.jsonl');
async function serp(kw,mobile){
  const url=mobile?'https://m.search.naver.com/search.naver?where=m&sm=mob_hty&query='+encodeURIComponent(kw)
                  :'https://search.naver.com/search.naver?where=nexearch&query='+encodeURIComponent(kw);
  const r=await fetch(url,{headers:{'User-Agent':mobile?MUA:UA,'Accept-Language':'ko-KR,ko;q=0.9'},signal:AbortSignal.timeout(20000)});
  return await r.text();
}
function ads(html){const out=[];const re=/a=pwl[^"']{0,200}?&r=(\d+)&i=(nad-[0-9a-z-]+)/gi;let m;
 while((m=re.exec(html)))out.push({r:+m[1],ctx:html.slice(m.index,m.index+700)});return out;}
const rankOf=h=>{const a=ads(h).filter(x=>TARGET.test(x.ctx));return a.length?Math.min(...a.map(x=>x.r)):null;};
const slots=h=>new Set(ads(h).map(x=>x.r)).size;
async function pool(items,n,fn){let i=0;await Promise.all(Array.from({length:Math.min(n,items.length)},async()=>{
 while(i<items.length){const k=i++;await fn(items[k],k);}}));}
(async()=>{
 const kws=JSON.parse(fs.readFileSync(IN));
 const done=new Set();
 if(fs.existsSync(OUT))for(const l of fs.readFileSync(OUT,'utf8').split('\n'))if(l.trim()){try{done.add(JSON.parse(l).kw)}catch(e){}}
 const todo=kws.filter(k=>!done.has(k));
 console.log('측정 대상',todo.length,'(완료',done.size,') 시작',new Date().toLocaleString('ko-KR'));
 const fd=fs.openSync(OUT,'a');let n=0,ctl=0,ctlBad=0;
 await pool(todo,1,async kw=>{
  const row={kw,t:new Date().toISOString()};
  for(const [key,mob] of [['pc',false],['mo',true]]){
   try{const h=await serp(kw,mob);row[key]=rankOf(h);row[key+'Slots']=slots(h);}
   catch(e){row[key]='ERR';}
   await sleep(1500);
  }
  fs.writeSync(fd,JSON.stringify(row)+'\n');
  if(++n%20===0){ // 대조군
   try{const h=await serp('키네스',false);const r=rankOf(h);ctl++;if(!r)ctlBad++;
    console.log(n,'/',todo.length,'| 대조군 키네스',r?r+'위':'미노출(측정 의심)');}catch(e){}
  }
 });
 fs.closeSync(fd);
 console.log('완료',n,'| 대조군 점검',ctl,'회 중 이상',ctlBad);
})().catch(e=>{console.error(e);process.exitCode=1});
