const fs=require('fs'),path=require('path');const D=path.join(__dirname,'reports','kiness_bidreset_20260909');
const rows=JSON.parse(fs.readFileSync(path.join(D,'ladder_rows.json'),'utf8'));
const txt=fs.readFileSync(path.join(__dirname,'_kiness_20260908_full_analysis.csv'),'utf8').replace(/^﻿/,'');
const lines=txt.split(/\r?\n/).filter(Boolean),hdr=lines[0].split(',');
const iId=hdr.indexOf('id'),iPv=hdr.indexOf('pc_volume'),iMv=hdr.indexOf('mobile_volume');
const vol=new Map();
for(let i=1;i<lines.length;i++){const c=lines[i].split(',');if(c.length<hdr.length)continue;vol.set(c[iId],{pv:+c[iPv]||0,mv:+c[iMv]||0});}
const {LADDER}=require('./_kiness_20260909_reset_ladder');
for(const r of rows){const v=vol.get(r.id);r.pv=v?v.pv:null;r.mv=v?v.mv:null;r.vol=v?v.pv+v.mv:null;
 r.targetRank=LADDER[r.tier].rank;r.cpc7=r.clk7?Math.round(r.cost7/r.clk7):0;}
fs.writeFileSync(path.join(D,'plan_vol.json'),JSON.stringify(rows));
console.log('rows',rows.length,'with volume',rows.filter(r=>r.vol>0).length,'intent',rows.filter(r=>r.targetRank).length);
