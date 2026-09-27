const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'reports','haeul_20260917');fs.mkdirSync(D,{recursive:true});
const script=fs.readFileSync(path.join(__dirname,'_haeul_20260917_kwmaster.py'),'utf8');
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:512*1024*1024,timeout:900000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
if(!line){console.error('FAIL status=',r.status,'\nSTDERR:',(r.stderr||'').slice(-1500),'\nSTDOUT:',(r.stdout||'').slice(-1500));process.exit(1);}
const out=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
console.log('status',out.status,'rows',out.n);
fs.writeFileSync(path.join(D,'kw_master.json'),JSON.stringify(out.rows||[]));
