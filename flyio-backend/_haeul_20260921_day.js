const fs=require('fs'),path=require('path'),cp=require('child_process'),zlib=require('zlib');
const D=path.join(__dirname,'reports','haeul_20260921');fs.mkdirSync(D,{recursive:true});
const src=process.argv[2]||'_haeul_20260921_day.py';
const out=process.argv[3]||'day.json';
const script=fs.readFileSync(path.join(__dirname,src),'utf8');
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*1024,timeout:1500000,windowsHide:true});
const line=(r.stdout||'').split(/\r?\n/).find(l=>l.startsWith('HAEUL_RESULT:'));
if(!line){console.error('FAIL status=',r.status,'\nSTDERR:',(r.stderr||'').slice(-2000),'\nSTDOUT:',(r.stdout||'').slice(-2000));process.exit(1);}
const o=JSON.parse(zlib.inflateSync(Buffer.from(line.slice(13),'base64')).toString('utf8'));
fs.writeFileSync(path.join(D,out),JSON.stringify(o));
console.log('saved',out,'keys',Object.keys(o).join(','));
for(const k of Object.keys(o))if(Array.isArray(o[k]))console.log('  ',k,o[k].length);
console.log('statuses',o.ad_detail_status,o.exp_status,o.kw_master_status);
