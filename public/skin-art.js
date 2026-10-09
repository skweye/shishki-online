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
  const paths = ENGRAVINGS[skin];
  if (!paths) return '';
  return `<svg class="piece-engraving" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/>${paths.map((d,i) => `<path d="${d}" class="engraving-${i}"/>`).join('')}</svg>`;
}
export function drawEngraving(ctx, skin, x, y, radius, side) {
  const paths = ENGRAVINGS[skin]; if (!paths) return false;
  ctx.save(); ctx.translate(x-radius*.82,y-radius*.82); ctx.scale(radius*1.64/100,radius*1.64/100);
  ctx.strokeStyle = ctx.fillStyle = side === 'white' ? (skin === 'fox' ? '#7b4b37' : '#385a6a') : '#ecd59b';
  ctx.lineWidth = 1.7; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.arc(50,50,46,0,Math.PI*2); ctx.stroke();
  paths.forEach((d,i) => { const path = new Path2D(d); if (skin === 'fox' && i === 1 || skin === 'compass' && i === 0) ctx.stroke(path); else ctx.fill(path); });
  ctx.restore(); return true;
}
