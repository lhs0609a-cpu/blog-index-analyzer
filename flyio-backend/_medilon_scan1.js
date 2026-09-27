const fs=require('fs');const R='reports/medilon_20260921/';
const kw=fs.readFileSync(R+'keyword.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const FIN=['대출','자금','융자','론','금리','한도','상환','담보','보증','마이너스통장','마통','대환','신용','캐피탈','이자','원리금','연체','채무','빚','파산','회생','워크아웃','신불자','저축은행','은행','금융','대부','여신','거치','DSR','LTV','펀딩','투자','리스','할부','매출채권','팩토링','정책자금','지원금','보조금','신보','기보','소진공','중진공'];
const re=new RegExp(FIN.join('|'));
const no=[],yes=[];
for(const r of kw){(re.test(r[3])?yes:no).push(r[3]);}
console.log('금융토큰 포함',yes.length,'/ 미포함',no.length);
fs.writeFileSync(R+'nofin.txt',no.join('\n'));
const tail={};for(const k of no){for(let i=2;i<=4;i++){for(let j=0;j+i<=k.length;j++){const t=k.slice(j,j+i);tail[t]=(tail[t]||0)+1}}}
console.log(Object.entries(tail).filter(x=>x[1]>=120).sort((a,b)=>b[1]-a[1]).slice(0,90).map(x=>x[0]+':'+x[1]).join('  '));
