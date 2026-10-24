// 볼륨 조회 — 60개씩 끊어 SSH 페이로드를 줄인다(239개 인라인은 전송 실패한다)
const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'reports','haeul_20260922');
const kws=JSON.parse(fs.readFileSync(path.join(D,'loc_final_kw.json'),'utf8'));
const src=fs.readFileSync(path.join(__dirname,'_haeul_20260922_vol.py'),'utf8');
const SZ=40; const out={};
for(let i=0;i<kws.length;i+=SZ){
  const part=kws.slice(i,i+SZ);
  const script=src.replace('__KWS__',JSON.stringify(part));
  const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
  let r,line;
  for(let t=0;t<4;t++){
    r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*256,timeout:900000,windowsHide:true});
    line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
    if(line)break; console.log('  재시도',i/SZ,t+1);
  }
  if(!line){console.log('FAIL chunk',i/SZ,(r.stderr||'').slice(-300));continue;}
  const o=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
  let n=0;for(const [k,v] of Object.entries(o)){if(k==='__err')continue;out[k]=v;n++;}
  console.log('chunk',i/SZ,'요청',part.length,'→ 볼륨응답',n);
}
fs.writeFileSync(path.join(D,'vol_loc.json'),JSON.stringify(out));
console.log('총 볼륨 확보',Object.keys(out).length,'/',kws.length);
