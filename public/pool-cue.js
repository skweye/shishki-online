export const CUE_PALETTES = Object.freeze({
  bamboo: ['#ecdf9c','#9caa57','#435a33','#394c2c','#e2d7a0'],
  sabre: ['#f1efff','#8b9ba9','#333d50','#263043','#c6dcf2'],
  dragon: ['#ffe1a2','#b8663d','#4e2329','#371d29','#ffbd6c'],
  plasma: ['#ddfcff','#41acbd','#173446','#20263d','#88fcff'],
  aurora: ['#f5e9ff','#9e98d9','#37345d','#262f50','#a1ffe2'],
  classic: ['#f0d4a6','#c48d53','#634124','#352720','#dbb77d'],
  carbon: ['#aab6c2','#52616e','#17212a','#101820','#81d9ee'],
  emerald: ['#d8f7d9','#439979','#123b31','#14332a','#e4ca87'],
  royal: ['#e1d8fc','#8674bf','#332751','#281d41','#edcc76'],
  ember: ['#ffe1ad','#de8a41','#6a2c20','#50291f','#ffd08b'],
  neon: ['#daffff','#4abac7','#193946','#243047','#f799d8']
});
export const validCueSkin=value=>Object.hasOwn(CUE_PALETTES,value)?value:'classic';
export const animatedCue=skin=>['dragon','plasma','aurora'].includes(skin);
export const CUE_SHAPES=Object.freeze({
  bamboo:[[0,3],[80,4],[82,6],[89,6],[91,4],[168,5],[170,7],[178,7],[180,5],[257,6],[259,9],[268,9],[270,7],[326,9],[334,6]],
  sabre:[[0,3],[130,4],[184,6],[211,12],[288,13],[340,6]],
  dragon:[[0,3],[135,4],[176,7],[188,16],[200,8],[214,18],[225,9],[240,17],[254,9],[276,12],[322,10],[338,5]],
  plasma:[[0,3],[112,4],[154,7],[180,11],[300,12],[338,7]],
  aurora:[[0,3],[105,4],[164,6],[194,13],[221,8],[249,14],[275,9],[311,15],[340,5]]
});
function outline(ctx,skin,gap){
  const shape=CUE_SHAPES[skin]||[[0,3],[330,8]];
  ctx.beginPath();ctx.moveTo(-gap,-3);
  for(const [x,y] of shape.slice(1))ctx.lineTo(-gap-x,-y);
  for(const [x,y] of [...shape].reverse())ctx.lineTo(-gap-x,y);
  ctx.closePath();
  if(skin==='plasma')ctx.roundRect(-gap-314,-4,133,8,4);
}
function aura(ctx,skin,gap,time){
  if(!animatedCue(skin))return;
  const phase=time/1000,ink=CUE_PALETTES[skin][4];
  ctx.save();ctx.translate(-gap,0);ctx.strokeStyle=ctx.fillStyle=ink;ctx.shadowColor=ink;ctx.shadowBlur=8;
  if(skin==='dragon')for(let i=0;i<13;i++){
    const t=(phase*.35+i/13)%1,x=-170-t*155,y=(i%2?1:-1)*(10+Math.sin(t*Math.PI)*12);
    ctx.globalAlpha=Math.sin(t*Math.PI)*.75;ctx.beginPath();ctx.arc(x,y,.7+t*1.3,0,Math.PI*2);ctx.fill();
  }
  if(skin==='plasma'){
    ctx.lineWidth=2;ctx.globalAlpha=.6;ctx.beginPath();ctx.moveTo(-125,0);ctx.lineTo(-325,0);ctx.stroke();
    for(let i=0;i<5;i++){const x=-325+((phase*.45+i/5)%1)*195;ctx.globalAlpha=.85;ctx.fillRect(x,-1.8,13,3.6);}
  }
  if(skin==='aurora')for(let j=0;j<3;j++){
    ctx.strokeStyle=['#94ffdd','#a6b5ff','#e2a7ff'][j];ctx.lineWidth=1.5+j*.4;ctx.globalAlpha=.55;ctx.beginPath();
    for(let i=0;i<=60;i++){const x=-125-i*3.4,y=Math.sin(i*.14-phase*1.5+j*1.7)*(5+j*3);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
  }
  ctx.restore();
}
// The same full-length cue is used at the table and in shop previews.
export function drawCue(ctx,skin,gap=0,time=0) {
  skin=validCueSkin(skin);
  const [light,mid,dark,grip,inlay]=CUE_PALETTES[validCueSkin(skin)];
  ctx.save();
  const wood=ctx.createLinearGradient(0,-7,0,7);wood.addColorStop(0,light);wood.addColorStop(.42,mid);wood.addColorStop(1,dark);
  ctx.shadowColor='#0008';ctx.shadowBlur=6;ctx.shadowOffsetY=4;ctx.fillStyle=wood;
  outline(ctx,skin,gap);ctx.fill('evenodd');
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.save();ctx.clip('evenodd');
  ctx.fillStyle=grip;ctx.fillRect(-gap-314,-9,88,18);
  ctx.strokeStyle=inlay;ctx.lineWidth=1;ctx.globalAlpha=.55;
  for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(-gap-309+i*7,-9);ctx.lineTo(-gap-303+i*7,9);ctx.stroke();}
  ctx.globalAlpha=1;ctx.fillStyle=inlay;
  for(const x of [325,316,224,214])ctx.fillRect(-gap-x,-9,3,18);
  for(const x of [185,155]){ctx.beginPath();ctx.moveTo(-gap-x-15,0);ctx.lineTo(-gap-x,3);ctx.lineTo(-gap-x+15,0);ctx.lineTo(-gap-x,-3);ctx.closePath();ctx.fill();}
  if(skin==='bamboo'){
    ctx.strokeStyle=dark;ctx.globalAlpha=.5;ctx.lineWidth=1;
    for(let y=-4;y<=4;y+=2){ctx.beginPath();ctx.moveTo(-gap-25,y);ctx.bezierCurveTo(-gap-95,y-2,-gap-200,y+3,-gap-328,y);ctx.stroke();}
    for(const x of [85,174,263]){ctx.fillStyle=inlay;ctx.fillRect(-gap-x-2,-10,4,20);}
  }
  if(skin==='sabre'||skin==='aurora'){
    ctx.globalAlpha=.5;ctx.fillStyle=light;ctx.beginPath();ctx.moveTo(-gap-145,0);ctx.lineTo(-gap-215,-13);ctx.lineTo(-gap-335,0);ctx.lineTo(-gap-235,4);ctx.closePath();ctx.fill();
  }
  if(skin==='dragon'){
    ctx.strokeStyle=inlay;ctx.lineWidth=.8;ctx.globalAlpha=.8;
    for(let x=170;x<320;x+=11)for(const y of [-6,1,8]){ctx.beginPath();ctx.arc(-gap-x+(y===1?5:0),y,5,0,Math.PI);ctx.stroke();}
  }
  ctx.restore();ctx.fillStyle='#efe6d1';ctx.fillRect(-gap-12,-3.2,11,6.4);ctx.fillStyle='#609d9b';ctx.fillRect(-gap-2,-3.2,3,6.4);ctx.restore();
  aura(ctx,skin,gap,time);
}
