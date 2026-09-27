const fs=require('fs'),path=require('path');const {req,sleep}=require('./_sojam_naver');
const DIR=path.join(__dirname,'../reports/sojam-20260911/linked');const KWF=path.join(DIR,'kw.jsonl'),SF=path.join(DIR,'seeds.txt');
const pv=s=>{s=String(s);const lt=s.indexOf('<')>=0;return{v:lt?0:parseInt(s.replace(/[^0-9]/g,'')||'0',10),lt};};
const SEED=[
'결절성양진','양진','결절성양진치료','결절성양진한의원','만성단순태선','태선화','편평태선','경화태선','신경피부염','신경성피부염','신경성가려움','심인성가려움',
'이상감각','피부이상감각','감각이상가려움','배부착색성가려움','등쪽가려움','등가려움증','견갑골가려움','팔오금가려움','상완요골가려움','햇빛가려움',
'수인성소양증','샤워후가려움','물닿으면가려움','씻고나면가려움','목욕후가려움','겨울가려움','건조증가려움','피부건조증','노인성건조증','노인성피부염','피부노화가려움',
'당뇨가려움','당뇨피부가려움','신장가려움','투석가려움','요독성소양증','간가려움','간질환가려움','담즙가려움','황달가려움','갑상선가려움','빈혈가려움','철결핍가려움',
'약부작용가려움','약물발진','약진','항암가려움','항생제발진','진통제발진','혈압약가려움','임신가려움증','임신성소양증','산후가려움','갱년기소양증','폐경가려움',
'스트레스피부','스트레스가려움증','우울증가려움','불안가려움','수면가려움',
'벌레물림','벌레물린자국','모기물림','모기알레르기','진드기물림','빈대물림','벼룩물림','개미물림','옴진드기','옴증상','이가려움',
'접촉알레르기','금속알레르기','니켈알레르기','화장품알레르기','세제알레르기','옷알레르기','고무알레르기','라텍스알레르기','헤어염색알레르기','염색약알레르기','파마약알레르기',
'햇빛알레르기','광과민','일광두드러기제외','한랭알레르기','땀알레르기','열알레르기','음식알레르기피부','알레르기피부염','알레르기성피부염',
'스테로이드피부염','스테로이드중독','스테로이드부작용피부','탈스테로이드','탈스테','리바운드증상','스테로이드끊고',
'피부작열감','피부화끈거림','피부따가움','피부따끔','피부찌릿','피부쓰라림','피부예민','민감성피부가려움','피부통증','피부가렵고따가움','화끈가려움',
'피부근염','피부루푸스','홍반성루푸스','쇼그렌가려움','유사천포창','수포성유사천포창','천포창','피부경화증','베체트피부',
'원인모를가려움','원인불명가려움','전신가려움원인','밤에가려움원인','가려움질환','가려움병','가려움증종류','소양증원인','피부질환종류가려움'];
const SIG=/가려|가렵|간지|소양|양진|태선|신경피부염|이상감각|감각이상|작열|화끈|따가|따끔|찌릿|쓰라|알레르기|물림|물린|진드기|천포창|피부근염|루푸스|스테로이드|탈스|건조증|발진|약진/;
(async()=>{
const known=new Map();if(fs.existsSync(KWF))for(const l of fs.readFileSync(KWF,'utf8').split('\n'))if(l.trim()){const d=JSON.parse(l);known.set(d.k,d);}
const done=new Set(fs.existsSync(SF)?fs.readFileSync(SF,'utf8').split('\n').filter(Boolean):[]);
let q=SEED.filter(s=>!done.has(s));
for(let w=1;w<=5&&q.length;w++){let fresh=0;
 for(let i=0;i<q.length;i+=5){const h=q.slice(i,i+5);
  try{const r=await req('GET','/keywordstool?hintKeywords='+encodeURIComponent(h.join(','))+'&showDetail=1',null,3808925,3);
   for(const k of (r&&r.keywordList)||[]){if(known.has(k.relKeyword))continue;const pc=pv(k.monthlyPcQcCnt),mo=pv(k.monthlyMobileQcCnt);
    const d={k:k.relKeyword,pc:pc.v,mo:mo.v,pcLt:pc.lt,moLt:mo.lt,comp:k.compIdx,w};known.set(d.k,d);fs.appendFileSync(KWF,JSON.stringify(d)+'\n');fresh++;}}catch(e){}
  for(const x of h){done.add(x);fs.appendFileSync(SF,x+'\n');}await sleep(300);}
 q=[...known.values()].filter(d=>SIG.test(d.k)&&!(d.pcLt&&d.moLt)&&!done.has(d.k)).map(d=>d.k);
 console.error('웨이브',w,'새',fresh,'누적',known.size,'다음시드',q.length);}
console.log('DONE',known.size,'남은시드',q.length);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
