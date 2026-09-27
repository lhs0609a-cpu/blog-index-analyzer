// fly 머신 안에서 python 페이로드를 실행하고 SOJAM_RESULT 한 줄(zlib+base64)로 회수한다.
// 사용: node _sojam_20260921_run.js <payload.py> <out.json>
const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'..','reports','sojam-20260921');fs.mkdirSync(D,{recursive:true});
const src=process.argv[2];
const out=process.argv[3];
const script=fs.readFileSync(path.join(__dirname,src),'utf8');
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const t=Date.now();
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*1024,timeout:1800000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('SOJAM_RESULT:'));
if(!line){console.error('FAIL status=',r.status,'ms',Date.now()-t,'\nSTDERR:',(r.stderr||'').slice(-3000),'\nSTDOUT:',(r.stdout||'').slice(-3000));process.exit(1);}
const o=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
fs.writeFileSync(path.join(D,out+'.tmp'),JSON.stringify(o));fs.renameSync(path.join(D,out+'.tmp'),path.join(D,out));
console.log('saved',out,'ms',Date.now()-t);
for(const k of Object.keys(o))console.log('  ',k,Array.isArray(o[k])?o[k].length+' rows':JSON.stringify(o[k]).slice(0,200));
