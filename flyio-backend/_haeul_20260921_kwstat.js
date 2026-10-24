const fs=require('fs'),path=require('path'),cp=require('child_process');
const ids=JSON.parse(fs.readFileSync(path.join(__dirname,'reports','haeul_20260921','_all_ids.json'),'utf8'));
const suf=ids.map(x=>{if(!x.startsWith('nkw-a001-01-'))throw Error('prefix '+x);return x.slice(12);});
const SZ=300;
const src=fs.readFileSync(path.join(__dirname,'_haeul_20260921_kwstat.py'),'utf8');
for(let i=0;i<suf.length;i+=SZ){
 const part='p'+(i/SZ);
 const script=src.replace('__PART__',JSON.stringify(part)).replace('__IDS__',JSON.stringify(suf.slice(i,i+SZ)));
 const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
 console.log(part,'cmdlen',quoted.length);
 const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*256,timeout:900000,windowsHide:true});
 process.stdout.write(r.stdout||'');
 if(!/DONE|SKIP/.test(r.stdout||''))console.error('FAIL',part,(r.stderr||'').slice(-1500));
}
