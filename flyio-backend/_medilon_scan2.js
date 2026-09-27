const fs=require('fs');const R='reports/medilon_20260921/';
const kw=fs.readFileSync(R+'keyword.tsv','utf8').split(/\r?\n/).filter(Boolean).map(l=>l.split('\t'));
const FIN=['대출','자금','융자','론','금리','한도','상환','담보','보증','마이너스통장','마통','대환','신용','캐피탈','이자','원리금','연체','채무','빚','파산','회생','워크아웃','신불자','저축은행','은행','금융','대부','여신','거치','DSR','LTV','펀딩','투자','리스','할부','매출채권','팩토링','정책자금','지원금','보조금','신보','기보','소진공','중진공',
'진흥공단','희망리턴','손실보전','소상공인','중소벤처','벤처기업','재도전','경영안정','창업기업','기술평가','바우처','출연금','공제','노란우산','두루누리','일자리안정'];
const re=new RegExp(FIN.join('|'));
const no=[];for(const r of kw){if(!re.test(r[3]))no.push(r[3]);}
console.log('금융/정책 토큰 미포함',no.length);
fs.writeFileSync(R+'nofin2.txt',no.join('\n'));
const tail={};for(const k of no){for(let i=2;i<=5;i++){for(let j=0;j+i<=k.length;j++){const t=k.slice(j,j+i);tail[t]=(tail[t]||0)+1}}}
const top=Object.entries(tail).filter(x=>x[1]>=60).sort((a,b)=>b[1]-a[1]);
// 포함관계 중복 제거: 더 긴 문자열이 같은 카운트면 긴 것만
const keep=top.filter(([t,c])=>!top.some(([t2,c2])=>t2!==t&&t2.includes(t)&&c2>=c*0.9));
console.log(keep.slice(0,120).map(x=>x[0]+':'+x[1]).join('  '));
