// 해울 캠페인 일예산. 사용: node _haeul_20260922_cbudget.js --dry | --apply [--revert]
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert');
const mode=process.argv.includes('--apply')?'apply':process.argv.includes('--dry')?'dry':null;
assert(mode,'--dry 또는 --apply');
const revert=process.argv.includes('--revert');
const PLAN=[['해울_자동풀5_0G_949342',15000,25000]];
for(const [n,cur,after] of PLAN){assert(after%1000===0&&after>=1000&&after<=60000,'range '+n);}
const items=PLAN.map(([n,cur,after])=>revert?[n,after,cur]:[n,cur,after]);
console.log((revert?'되돌리기 ':'')+'캠페인',items.length,'개',JSON.stringify(items));
const src=fs.readFileSync(path.join(__dirname,'_haeul_20260922_cbudget.py'),'utf8')
  .replace('__MODE__',JSON.stringify(mode)).replace('__ITEMS__',JSON.stringify(items));
const quoted="'"+src.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
let r;for(let t=0;t<4;t++){r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*256,timeout:900000,windowsHide:true});if(/^(DONE|DRY|SKIP)/m.test(r.stdout||''))break;console.log('  재시도',t+1);}
const out=(r.stdout||'').split(/\r?\n/).filter(l=>/^(DONE|DRY|SKIP|BAD:|SKIPS:|  )/.test(l)).join('\n');
console.log(out||('FAIL '+(r.stderr||'').slice(-1200)));
