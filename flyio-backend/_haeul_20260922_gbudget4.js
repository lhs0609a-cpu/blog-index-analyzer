// 해울 0914 그룹 일예산 인상. 사용: node _haeul_20260922_gbudget.js --dry | --apply [--revert]
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert');
const D=path.join(__dirname,'reports','haeul_20260921');
const mode=process.argv.includes('--apply')?'apply':process.argv.includes('--dry')?'dry':null;
assert(mode,'--dry 또는 --apply');
const revert=process.argv.includes('--revert');
const rows=JSON.parse(fs.readFileSync(path.join(D,'group_budget_plan4.json'),'utf8'));
for(const r of rows){assert(r.gid.startsWith('grp-'),'gid');assert(r.after%1000===0&&r.after>=2000&&r.after<=30000,'range '+r.name+' '+r.after);assert(/지역한의원/.test(r.name),'name '+r.name);}
const items=rows.map(r=>revert?[r.gid,r.after,r.cur,r.name]:[r.gid,r.cur,r.after,r.name]);
console.log((revert?'되돌리기 ':'')+'그룹',items.length,'개 | capacity',rows.reduce((s,r)=>s+(revert?r.cur:r.after),0),'원');
const src=fs.readFileSync(path.join(__dirname,'_haeul_20260922_gbudget.py'),'utf8')
  .replace('__MODE__',JSON.stringify(mode)).replace('__ITEMS__',JSON.stringify(items));
const quoted="'"+src.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
let r;for(let t=0;t<4;t++){r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*256,timeout:900000,windowsHide:true});if(/^(DONE|DRY|SKIP)/m.test(r.stdout||''))break;console.log('  재시도',t+1);}
const out=(r.stdout||'').split(/\r?\n/).filter(l=>/^(DONE|DRY|SKIP|BAD:|SKIPS:|  )/.test(l)).join('\n');
console.log(out||('FAIL '+(r.stderr||'').slice(-1200)));
