const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
for(const l of fs.readFileSync(path.join(D,'serp_region.jsonl'),'utf8').split('\n').filter(Boolean)){
 const x=JSON.parse(l);
 console.log([x.keyword.padEnd(10),x.device.padEnd(6),(x.status||'').padEnd(12),'순위'+String(x.rank??'-').padStart(4),
  '광고수'+String(x.adCount??'-').padStart(3),'입찰'+String(x.bid).padStart(6)].join(' | '));
 if(x.ads&&x.ads.length)for(const a of x.ads.slice(0,6))console.log('      ',a.position,a.kiness?'★':' ',a.text.slice(0,70));
}
