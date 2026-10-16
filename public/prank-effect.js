import {PRANKS} from './pranks.js';
// Sound feedback only: owner actions never place a notice over the game.
export function createPrankEffect(sound){
  let timer,stopSound;
  function cancel(){clearTimeout(timer);stopSound?.();stopSound=null;}
  function play(variant){
    cancel();if(!Object.hasOwn(PRANKS,variant)||variant==='pool8'||document.hidden)return;
    stopSound=sound('prank-'+variant);timer=setTimeout(cancel,2200);
  }
  document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});
  return {play,cancel};
}
