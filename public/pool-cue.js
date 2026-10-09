export const CUE_PALETTES = Object.freeze({
  classic: ['#f0d4a6','#c48d53','#634124','#352720','#dbb77d'],
  carbon: ['#aab6c2','#52616e','#17212a','#101820','#81d9ee'],
  emerald: ['#d8f7d9','#439979','#123b31','#14332a','#e4ca87'],
  royal: ['#e1d8fc','#8674bf','#332751','#281d41','#edcc76'],
  ember: ['#ffe1ad','#de8a41','#6a2c20','#50291f','#ffd08b'],
  neon: ['#daffff','#4abac7','#193946','#243047','#f799d8']
});
export const validCueSkin=value=>Object.hasOwn(CUE_PALETTES,value)?value:'classic';
// The same full-length cue is used at the table and in shop previews.
export function drawCue(ctx,skin,gap=0) {
  const [light,mid,dark,grip,inlay]=CUE_PALETTES[validCueSkin(skin)];
  ctx.save();
  const wood=ctx.createLinearGradient(0,-7,0,7);wood.addColorStop(0,light);wood.addColorStop(.42,mid);wood.addColorStop(1,dark);
  ctx.shadowColor='#0008';ctx.shadowBlur=6;ctx.shadowOffsetY=4;ctx.fillStyle=wood;
  ctx.beginPath();ctx.moveTo(-gap,-3);ctx.lineTo(-gap-330,-8);ctx.lineTo(-gap-330,8);ctx.lineTo(-gap,3);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.save();ctx.clip();
  ctx.fillStyle=grip;ctx.fillRect(-gap-314,-9,88,18);
  ctx.strokeStyle=inlay;ctx.lineWidth=1;ctx.globalAlpha=.55;
  for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(-gap-309+i*7,-9);ctx.lineTo(-gap-303+i*7,9);ctx.stroke();}
  ctx.globalAlpha=1;ctx.fillStyle=inlay;
  for(const x of [325,316,224,214])ctx.fillRect(-gap-x,-9,3,18);
  for(const x of [185,155]){ctx.beginPath();ctx.moveTo(-gap-x-15,0);ctx.lineTo(-gap-x,3);ctx.lineTo(-gap-x+15,0);ctx.lineTo(-gap-x,-3);ctx.closePath();ctx.fill();}
  ctx.restore();ctx.fillStyle='#efe6d1';ctx.fillRect(-gap-12,-3.2,11,6.4);ctx.fillStyle='#609d9b';ctx.fillRect(-gap-2,-3.2,3,6.4);ctx.restore();
}
