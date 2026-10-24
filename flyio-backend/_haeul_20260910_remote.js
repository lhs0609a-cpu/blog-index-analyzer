const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'reports','haeul_20260910');fs.mkdirSync(D,{recursive:true});
const script=fs.readFileSync(path.join(__dirname,'_haeul_20260910_remote.py'),'utf8');
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:64*1024*1024,timeout:900000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
if(!line){console.error('Remote read failed status=',r.status,'\nSTDERR:',(r.stderr||'').slice(-2000),'\nSTDOUT:',(r.stdout||'').slice(-2000));process.exit(1);}
const out=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
fs.writeFileSync(path.join(D,'raw_20260909.json'),JSON.stringify(out));
console.log('OK adRows',out.adRows,'exRows',out.exRows,'clicked',out.clicked.length,'terms',out.terms.length);
console.log('adTotal',JSON.stringify(out.adTotal),'exTotal',JSON.stringify(out.exTotal));
