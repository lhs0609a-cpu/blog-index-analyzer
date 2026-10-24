const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
(async()=>{
  const q='아토피';
  // 1) 자동완성
  const ac='https://ac.search.naver.com/nx/ac?q='+encodeURIComponent(q)+'&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
  try{const r=await fetch(ac,{headers:{'User-Agent':UA,'Referer':'https://m.search.naver.com/'},signal:AbortSignal.timeout(15000)});
    const j=await r.json(); const list=(j.items&&j.items[0]||[]).map(x=>x[0]);
    console.log('자동완성',list.length,':',list.slice(0,12).join(', '));}catch(e){console.log('자동완성 실패',String(e).slice(0,120));}
  // 2) 모바일 SERP 연관검색어
  const url='https://m.search.naver.com/search.naver?query='+encodeURIComponent(q);
  try{const r=await fetch(url,{headers:{'User-Agent':UA},signal:AbortSignal.timeout(20000)});
    const h=await r.text(); console.log('SERP 길이',h.length);
    const pats=[/related_srch[\s\S]{0,4000}?<\/div>/,/연관 ?검색어[\s\S]{0,3000}/];
    for(const p of pats){const m=h.match(p);if(m){console.log('---패턴 히트---');console.log(m[0].replace(/<[^>]+>/g,'|').replace(/\|+/g,'|').slice(0,800));break;}}
    const kws=[...h.matchAll(/class="keyword"[^>]*>([^<]{1,30})</g)].map(m=>m[1]);
    console.log('class=keyword 매치',kws.length,kws.slice(0,20).join(', '));
    const tt=[...h.matchAll(/data-template-id="[^"]*related[^"]*"/g)].length;console.log('related 템플릿',tt);
  }catch(e){console.log('SERP 실패',String(e).slice(0,160));}
})();
