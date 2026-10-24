// 네이버 파워링크 실순위 측정.
// ⚠️ 순위는 li 순서가 아니라 onclick 안의 r=<순위> 값이다. li 로 세면 미노출로 오판한다.
// ⚠️ onclick 은 작은따옴표로도 온다: onclick='return goOtherCR(this,"a=pwl_nop...&r=1&i=nad-...")'
// ⚠️ 미노출이 나오면 브랜드어('키네스')를 대조군으로 같이 재서 측정 자체가 깨진 게 아닌지 확인할 것.
// 사용: node _haeul_serp.js "키워드1" "키워드2" ...
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const MUA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const TARGET=/kiness/i;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function fetchSerp(kw,mobile){
  const url=mobile
    ? 'https://m.search.naver.com/search.naver?where=m&sm=mob_hty&query='+encodeURIComponent(kw)
    : 'https://search.naver.com/search.naver?where=nexearch&query='+encodeURIComponent(kw);
  const r=await fetch(url,{headers:{'User-Agent':mobile?MUA:UA,'Accept-Language':'ko-KR,ko;q=0.9'},signal:AbortSignal.timeout(20000)});
  return await r.text();
}

// r=<순위> 하나마다 그 앞뒤 문맥을 붙여 본다. 광고 링크는 a=pwl 로 시작한다.
function ads(html){
  const out=[];
  const re=/a=pwl[^"']{0,200}?&r=(\d+)&i=(nad-[0-9a-z-]+)/gi;
  let m;
  while((m=re.exec(html))){
    const ctx=html.slice(m.index,m.index+700);
    out.push({r:Number(m[1]),ad:m[2],ctx:ctx});
  }
  return out;
}
const rankOf=html=>{const a=ads(html).filter(x=>TARGET.test(x.ctx));return a.length?Math.min(...a.map(x=>x.r)):null;};
const slots=html=>new Set(ads(html).map(x=>x.r)).size;

(async()=>{
  const kws=process.argv.slice(2);
  if(!kws.length){console.log('키워드를 인자로 줄 것');return}
  console.log('시각 '+new Date().toLocaleString('ko-KR'));
  for(const kw of kws){
    const cell=[];
    for(const [lab,mob] of [['PC',false],['모바일',true]]){
      try{
        const html=await fetchSerp(kw,mob);
        const r=rankOf(html);
        cell.push(lab+' '+(r?r+'위':'미노출')+'(광고 '+slots(html)+'칸)');
      }catch(e){cell.push(lab+' 오류:'+String(e.message).slice(0,40))}
      await sleep(1200);
    }
    console.log('  '+kw.padEnd(16)+cell.join('  |  '));
  }
})();
