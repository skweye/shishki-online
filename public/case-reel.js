import { selectCaseItem,rarityOf } from './cases.js';
import { renderItemArt } from './item-art.js';
import { t } from './i18n.js';

export const REEL_WINNER_INDEX=32;
// Filler is decorative and uses the published distribution. Only the server's
// awarded item determines the result; no staged near-misses or client rerolls.
export function reelItems(box,winner,random=Math.random){
  return Array.from({length:40},(_,index)=>index===REEL_WINNER_INDEX?winner:selectCaseItem(box,random(),random()));
}
export function createCaseReel(root, onTick = () => {}){
  let animation=null,finish=null;
  function reset(){finish?.();animation?.cancel();animation=null;root.hidden=true;root.replaceChildren();}
  async function play(box,winner){
    reset();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    if(document.hidden||reduced.matches||document.documentElement.dataset.lowPerformance==='true')return;
    const track=document.createElement('div');track.className='case-reel-track';track.setAttribute('aria-hidden','true');
    for(const item of reelItems(box,winner)){
      const card=document.createElement('div');card.className='case-reel-card';card.dataset.rarity=rarityOf(item);
      const art=document.createElement('div');art.className='shop-art';renderItemArt(art,item);
      const name=document.createElement('span');name.textContent=t(item.name);card.append(art,name);track.append(card);
    }
    root.append(track);root.hidden=false;
    if(typeof track.animate!=='function'){reset();return;}
    // left:50% anchors the winner to the marker on every screen size, including
    // resize during the spin. Card width 128 + gap 12 is fixed in cases.css.
    animation=track.animate([{transform:'translateX(-64px)'},{transform:`translateX(-${REEL_WINNER_INDEX*140+64}px)`}],
      {duration:4400,easing:'cubic-bezier(.12,.68,.08,1)',fill:'forwards'});
    await new Promise(resolve=>{
      let done=false, frame=null, lastCell=0;
      function tick(){
        if(done)return;
        const progress=animation?.effect?.getComputedTiming().progress;
        const cell=Math.floor((progress || 0)*REEL_WINNER_INDEX+.5);
        if(cell>lastCell){lastCell=cell;onTick();}
        frame=requestAnimationFrame(tick);
      }
      if(typeof requestAnimationFrame==='function')frame=requestAnimationFrame(tick);
      const visibility=()=>{if(document.hidden)complete();};
      const motion=()=>{if(reduced.matches)complete();};
      function complete(){
        if(done)return;done=true;
        if(frame!==null)cancelAnimationFrame(frame);
        document.removeEventListener('visibilitychange',visibility);reduced.removeEventListener?.('change',motion);
        try{animation?.finish();}catch{}
        finish=null;track.children[REEL_WINNER_INDEX].classList.add('reel-winner');resolve();
      }
      finish=complete;document.addEventListener('visibilitychange',visibility);reduced.addEventListener?.('change',motion);
      animation.finished.then(complete,complete);
    });
  }
  return {play,reset};
}
