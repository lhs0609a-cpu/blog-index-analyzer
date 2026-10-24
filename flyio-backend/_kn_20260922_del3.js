const fs=require('fs'),path=require('path');const {req,pool}=require('./_sojam_naver');
const D=path.join(__dirname,'reports','kiness_20260922');const CID=441986;
const APPLY=process.argv.includes('--apply');
const LOG=path.join(D,'deleted_ids3.jsonl');
(async()=>{
 const plan=JSON.parse(fs.readFileSync(path.join(D,'delete_plan3.json')));
 const done=new Set();
 if(fs.existsSync(LOG)) for(const l of fs.readFileSync(LOG,'utf8').split('\n')) if(l.trim()) done.add(JSON.parse(l).kid);
 const ids=plan.delete.map(x=>x.kid).filter(i=>!done.has(i));
 console.log('삭제 대상',ids.length,'(이미 삭제',done.size,') APPLY=',APPLY);
 if(!APPLY){console.log('DRY RUN'); return;}
 const chunks=[];for(let i=0;i<ids.length;i+=100)chunks.push(ids.slice(i,i+100));
 const fd=fs.openSync(LOG,'a');let ok=0,err=0,msgs=new Set();
 for(const c of chunks){
  try{ await req('DELETE','/ncc/keywords?ids='+encodeURIComponent(c.join(',')),null,CID,4);
       fs.writeSync(fd,c.map(k=>JSON.stringify({kid:k})).join('\n')+'\n'); ok+=c.length; }
  catch(e){ err+=c.length; msgs.add(String(e).slice(0,160)); }
  if((ok+err)%1000<100) console.log('진행',ok+err,'/',ids.length,'실패',err);
 }
 fs.closeSync(fd);
 console.log('삭제 완료',ok,'실패',err); if(msgs.size)console.log([...msgs]);
})().catch(e=>{console.error(e);process.exitCode=1});
