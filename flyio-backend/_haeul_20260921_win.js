const fs=require('fs'),path=require('path'),cp=require('child_process');
const days=process.argv.slice(2);
if(!days.length){console.error('usage: node _haeul_20260921_win.js 20260822 ...');process.exit(1);}
let script=fs.readFileSync(path.join(__dirname,'_haeul_20260921_win.py'),'utf8');
script=script.replace('__DAYS__',JSON.stringify(days));
const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
const r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*1024,timeout:1740000,windowsHide:true});
process.stdout.write(r.stdout||'');
if(r.status!==0)console.error('STATUS',r.status,'STDERR:',(r.stderr||'').slice(-3000));
