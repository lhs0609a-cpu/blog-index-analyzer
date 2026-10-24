const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const script=fs.readFileSync(path.join(__dirname,'_haeul_20260909_remote_reports.py')).toString('base64');
const command="python -c \"import base64;exec(base64.b64decode('"+script+"'))\"";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C',command],{encoding:'utf8',maxBuffer:40*1024*1024,timeout:900000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
if(!line){console.error('Remote read failed',r.status,(r.stderr||'').slice(-1200),(r.stdout||'').slice(-500));process.exit(1);}
const out=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
fs.writeFileSync(path.join(__dirname,'reports','haeul_intent_20260909','search_reports_full.json'),JSON.stringify(out));console.log('REPORTS',out.days.length,'search terms',out.searchTerms.length,'ad keys',out.adKeywords.length);
