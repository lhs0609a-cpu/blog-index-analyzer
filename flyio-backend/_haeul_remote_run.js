// fly 머신에서 백엔드 자격증명으로 파이썬을 실행하고 HAEUL_RESULT 를 회수한다.
// ⚠️ -C 인자는 원격 sh 를 한 번 거친다. 백슬래시가 먹히므로 개행은 실제 개행으로 두고,
//    작은따옴표로 감싸되 소스 안의 작은따옴표는 '"'"' 로 이스케이프한다.
// 사용: node _haeul_remote_run.js <script.py> <출력파일.json>
const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const [py,outPath]=process.argv.slice(2);
if(!py||!outPath){console.error('사용: node _haeul_remote_run.js <script.py> <out.json>');process.exit(1);}
const src=fs.readFileSync(path.resolve(__dirname,py),'utf8').replace(/\r/g,'');
const quoted="'"+src.replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',
 ['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],
 {encoding:'utf8',maxBuffer:256*1024*1024,timeout:1800000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
if(!line){console.error('원격 실행 실패 status=',r.status,'\nSTDERR:',(r.stderr||'').slice(-2500),'\nSTDOUT:',(r.stdout||'').slice(-1500));process.exit(1);}
const out=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
const dest=path.resolve(__dirname,outPath);
fs.mkdirSync(path.dirname(dest),{recursive:true});
fs.writeFileSync(dest,JSON.stringify(out));
console.log('저장',dest,(fs.statSync(dest).size/1048576).toFixed(1)+'MB');
console.log(JSON.stringify(out).slice(0,2500));
