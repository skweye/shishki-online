import { SKIN_COLORS } from './shop-catalog.js';
// Deterministic material patterns shared by DOM pieces and the Chapaev canvas.
const wave=(y,bend)=>`M-8 ${y}C22 ${y-bend} 28 ${y+bend} 54 ${y}S86 ${y-bend} 108 ${y+bend/2}`;
const petal=angle=>{
  const r=angle*Math.PI/180,point=(x,y)=>`${(50+x*Math.cos(r)-y*Math.sin(r)).toFixed(2)} ${(50+x*Math.sin(r)+y*Math.cos(r)).toFixed(2)}`;
  return `M${point(9,0)}Q${point(23,-17)} ${point(34,0)}Q${point(23,17)} ${point(9,0)}Z`;
};
export const TEXTURES=Object.freeze({
  marble:{soft:[wave(24,22),wave(65,30)],fine:[wave(26,22),wave(69,29),'M24 0L38 19L34 28L53 42L62 60L89 79M34 28L12 49M62 60L58 90M89 79L100 78'],detail:['M0 75L22 60L35 64L49 54L61 52L75 28L92 22L100 8']},
  walnut:{soft:Array.from({length:8},(_,i)=>wave(i*15-5,12)),fine:Array.from({length:18},(_,i)=>wave(i*6-4,9)),detail:['M59 37C79 13 91 55 69 70C50 80 43 54 59 37ZM62 42C76 25 83 52 68 64C56 71 52 54 62 42Z']},
  damascus:{soft:Array.from({length:7},(_,i)=>wave(i*17,23)),fine:Array.from({length:25},(_,i)=>wave(i*5-10,24)),detail:['M37 46Q50 31 63 46Q50 69 37 46ZM44 47Q50 40 56 47Q50 58 44 47Z']},
  porcelain:{soft:Array.from({length:8},(_,i)=>petal(i*45)),fine:Array.from({length:12},(_,i)=>petal(i*30)),detail:['M41 50Q50 33 59 50Q50 67 41 50ZM17 25Q9 43 20 51M80 49Q91 65 79 78M26 14L30 20M72 82L76 89']},
  obsidian:{soft:['M0 17L28 33L42 2M28 33L19 61L0 69M19 61L55 79L79 100M28 33L65 39L96 18M65 39L76 69L100 73M76 69L55 79L39 100'],fine:['M6 0L28 33L65 39L76 69L100 92M0 69L19 61L55 79L51 100'],detail:['M42 2L28 33L19 61L55 79L76 69L65 39L96 18M55 79L39 100']},
  cosmic:{soft:[wave(25,30),wave(33,28),wave(63,30),wave(72,26)],fine:['M18 38L39 22L57 46L81 32M57 46L69 75L38 69L18 38'],detail:Array.from({length:22},(_,i)=>{const x=8+(i*37)%84,y=8+(i*23)%84,r=i%4===0?2.5:1;return `M${x-r} ${y}H${x+r}M${x} ${y-r}V${y+r}`;})}
});
function textureArt(skin){
  const texture=TEXTURES[skin];if(!texture)return '';
  return `<svg class="piece-texture" viewBox="0 0 100 100" aria-hidden="true">${Object.entries(texture).map(([kind,paths])=>paths.map(d=>`<path class="texture-${kind}" d="${d}"/>`).join('')).join('')}</svg>`;
}
const texturePaths=new Map();
// Original vector engravings shared by DOM pieces and the Chapaev canvas.
export const ENGRAVINGS = Object.freeze({
  fox: [
    'M69 11A25 25 0 0 0 88 47A26 26 0 0 1 69 11Z',
    'M22 29L42 40L57 40L76 28L70 64L50 81L29 64Z',
    'M27 38L42 46L34 54ZM69 38L57 46L65 54Z',
    'M34 57L45 60L40 63ZM65 57L55 60L60 63ZM46 70L54 70L50 75Z',
    'M13 59L17 64L13 69L9 64ZM80 73L83 77L80 81L77 77Z'
  ],
  compass: [
    'M50 12L57 41L87 50L57 58L50 88L42 58L13 50L42 41Z',
    'M50 22L50 50L43 42ZM78 50L50 50L57 43ZM50 78L50 50L57 58ZM22 50L50 50L42 57Z',
    'M25 25L41 34L34 41ZM75 25L66 41L59 34ZM75 75L59 66L66 59ZM25 75L34 59L41 66Z',
    'M48 4L52 4L52 9L48 9ZM91 48L96 48L96 52L91 52ZM48 91L52 91L52 96L48 96ZM4 48L9 48L9 52L4 52Z'
  ]
});
export function pieceArt(skin) {
  if(TEXTURES[skin])return textureArt(skin);
  const paths = ENGRAVINGS[skin];
  if (!paths) return '';
  return `<svg class="piece-engraving" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/>${paths.map((d,i) => `<path d="${d}" class="engraving-${i}"/>`).join('')}</svg>`;
}
export function drawEngraving(ctx, skin, x, y, radius, side) {
  if(TEXTURES[skin]){
    if(!texturePaths.has(skin))texturePaths.set(skin,Object.entries(TEXTURES[skin]).map(([kind,paths])=>[kind,paths.map(d=>new Path2D(d))]));
    ctx.save();ctx.translate(x-radius*.94,y-radius*.94);ctx.scale(radius*1.88/100,radius*1.88/100);
    ctx.beginPath();ctx.arc(50,50,50,0,Math.PI*2);ctx.clip();ctx.strokeStyle=SKIN_COLORS[skin][side][2];ctx.lineCap=ctx.lineJoin='round';
    const opacity=ctx.globalAlpha;
    for(const [kind,paths] of texturePaths.get(skin)){
      ctx.globalAlpha=opacity*(kind==='soft'?.28:kind==='fine'?.65:.9);ctx.lineWidth=kind==='soft'?3:kind==='fine'?.8:1.3;
      for(const path of paths)ctx.stroke(path);
    }
    ctx.restore();return true;
  }
  const paths = ENGRAVINGS[skin]; if (!paths) return false;
  ctx.save(); ctx.translate(x-radius*.82,y-radius*.82); ctx.scale(radius*1.64/100,radius*1.64/100);
  ctx.strokeStyle = ctx.fillStyle = side === 'white' ? (skin === 'fox' ? '#7b4b37' : '#385a6a') : '#ecd59b';
  ctx.lineWidth = 1.7; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(50,50,46,0,Math.PI*2); ctx.stroke();
  paths.forEach((d,i) => { const path = new Path2D(d); if (skin === 'fox' && i === 1 || skin === 'compass' && i === 0) ctx.stroke(path); else ctx.fill(path); });
  ctx.restore(); return true;
}
