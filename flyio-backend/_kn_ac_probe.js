const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function ac(q){
  const u='https://ac.search.naver.com/nx/ac?q='+encodeURIComponent(q)+'&con=0&frm=nv&ans=2&r_format=json&r_enc=UTF-8&r_unicode=0&t_koreng=1&run=2&rev=4&q_enc=UTF-8&st=100';
  const r=await fetch(u,{headers:{'User-Agent':UA,'Referer':'https://m.search.naver.com/'},signal:AbortSignal.timeout(20000)});
  const j=await r.json();return (j.items&&j.items[0]||[]).map(x=>x[0]).filter(Boolean);
}
(async()=>{
 for(const q of ['광안','광안리','상무','수완','성장클리닉','부산성장클리닉','해운대성장클리닉','강남성장클리닉','광안리성장','마린']){
  const r=await ac(q); console.log(q,'→',JSON.stringify(r)); await sleep(400);
 }
})();
