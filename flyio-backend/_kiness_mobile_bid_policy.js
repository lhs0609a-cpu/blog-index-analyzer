// A bid estimate is a historical forecast, not proof of a live placement.
module.exports.calculate=function(pc5,mobile3,pcWeight,mobileWeight){
 if([pc5,mobile3,pcWeight,mobileWeight].some(v=>!Number.isFinite(v)||v<=0))throw Error('Invalid bid inputs');
 const pcTarget=Math.max(700,pc5*1.05),mobileTarget=Math.max(700,mobile3*1.10);
 const wanted=Math.ceil(Math.max(pcTarget*100/pcWeight,mobileTarget*100/mobileWeight)/10)*10;
 const bid=Math.max(70,Math.min(100000,wanted));
 return {bid,pcTarget,mobileTarget,pcEffective:Math.round(bid*pcWeight/100),mobileEffective:Math.round(bid*mobileWeight/100),capped:wanted>100000};
};
