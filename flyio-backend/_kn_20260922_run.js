const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'reports','kiness_20260922');fs.mkdirSync(D,{recursive:true});
const src=process.argv[2],out=process.argv[3];
const script=fs.readFileSync(path.join(__dirname,src),'utf8');
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*1024,timeout:1800000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('KNRESULT:'));
if(!line){console.error('FAIL status=',r.status,'\nSTDERR:',(r.stderr||'').slice(-3000),'\nSTDOUT:',(r.stdout||'').slice(-3000));process.exit(1);}
const o=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(9),'base64')).toString('utf8'));
fs.writeFileSync(path.join(D,out),JSON.stringify(o));
for(const k of Object.keys(o))console.log(' ',k,Array.isArray(o[k])?o[k].length:o[k]);
