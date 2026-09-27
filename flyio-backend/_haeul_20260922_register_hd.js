// 해울 어지럼축 발굴분 등록. 사용: node _haeul_20260922_register.js --dry | --apply
const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert');
const D=path.join(__dirname,'reports','haeul_20260922');
const mode=process.argv.includes('--apply')?'apply':process.argv.includes('--dry')?'dry':null;
assert(mode,'--dry 또는 --apply');
const plan=JSON.parse(fs.readFileSync(path.join(D,'reg_plan_hd.json'),'utf8'));
for(const p of plan){
  assert(p.gid&&p.gid.startsWith('grp-'),'gid '+p.kw);
  assert(/^[가-힣A-Za-z0-9]+$/.test(p.kw),'형식 '+p.kw);
  assert(p.kw.length>=2&&p.kw.length<=25,'길이 '+p.kw);
}
assert(new Set(plan.map(p=>p.kw)).size===plan.length,'중복');
console.log('등록 계획',plan.length,'건 / 그룹',new Set(plan.map(p=>p.gid)).size,'개 / 전부 70원 그룹상속');
const src=fs.readFileSync(path.join(__dirname,'_haeul_20260922_register.py'),'utf8');
const SZ=50;
for(let i=0;i<plan.length;i+=SZ){
  const part='p'+(i/SZ);
  const items=plan.slice(i,i+SZ).map(p=>[p.gid,p.kw]);
  const script=src.replace('__MODE__',JSON.stringify(mode)).replace('__PART__',JSON.stringify(part)).replace('__ITEMS__',JSON.stringify(items));
  const quoted="'"+script.replace(/\r/g,'').replace(/'/g,`'"'"'`)+"'";
  let r;for(let t=0;t<4;t++){r=cp.spawnSync('C:/Users/leegu/.fly/bin/fly.exe',['ssh','console','-a','blog-index-analyzer','-C','python -c '+quoted],{encoding:'utf8',maxBuffer:1024*1024*256,timeout:900000,windowsHide:true});if(/^(DONE|DRY|SKIP)/m.test(r.stdout||''))break;console.log('  재시도',part,t+1);}
  console.log((r.stdout||'').split(/\r?\n/).filter(l=>/^(DONE|DRY|SKIP|FAILS:|SKIPS:)/.test(l)).join('\n')||('FAIL '+part+' '+(r.stderr||'').slice(-400)));
}
