// 해울 — 소재·확장소재 전체와 연결URL이 따로 박힌 키워드를 마스터 리포트로 한 번에 뜬다.
// 프록시로 4,363그룹을 한 개씩 돌면 서버 OOM 위험이라 fly 머신에서 백엔드 자격증명으로 받는다.
const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'reports','haeul_20260911');fs.mkdirSync(D,{recursive:true});
const script=fs.readFileSync(path.join(__dirname,'_haeul_20260911_inventory.py'),'utf8');
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:256*1024*1024,timeout:900000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
if(!line){console.error('Remote read failed status=',r.status,'\nSTDERR:',(r.stderr||'').slice(-2000),'\nSTDOUT:',(r.stdout||'').slice(-2000));process.exit(1);}
const out=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
fs.writeFileSync(path.join(D,'inventory.json'),JSON.stringify(out));
for(const [k,v] of Object.entries(out))console.log(k,v.status,'rows',v.rows,'linked',v.linked?.length??'-');
