const fs=require('fs'),path=require('path');
const D=path.join(__dirname,'reports','kiness_20260917');
const flat=JSON.parse(fs.readFileSync(path.join(D,'keywords_flat.json')));
const st=new Map();
for(const l of fs.readFileSync(path.join(D,'kwstats7.jsonl'),'utf8').split('\n')){if(!l.trim())continue;const o=JSON.parse(l);st.set(o.id,o);}
const byKw=new Map();
for(const k of flat){const s=st.get(k.id)||{i:0,c:0,s:0,r:0};
 let e=byKw.get(k.kw);if(!e){e={kw:k.kw,inst:0,on:0,elig:0,imp:0,clk:0,cost:0,rnk:0,rnkImp:0,maxBid:0,ids:[]};byKw.set(k.kw,e);}
 e.inst++;if(!k.lock)e.on++;if(!k.lock&&k.st==='ELIGIBLE')e.elig++;
 e.imp+=s.i;e.clk+=s.c;e.cost+=s.s;if(s.r>0&&s.i>0){e.rnk+=s.r*s.i;e.rnkImp+=s.i;}
 if(!k.lock&&(k.bid||0)>e.maxBid)e.maxBid=k.bid||0;
 if(!k.lock)e.ids.push(k.id);
}
const arr=[...byKw.values()];
const live=arr.filter(x=>x.on>0);
console.log('unique',arr.length,'with live instance',live.length);
console.log('imp>0',live.filter(x=>x.imp>0).length,'imp=0',live.filter(x=>x.imp===0).length);
console.log('cost>0',live.filter(x=>x.cost>0).length,'clk>0',live.filter(x=>x.clk>0).length);
fs.writeFileSync(path.join(D,'by_keyword.json'),JSON.stringify(arr));
