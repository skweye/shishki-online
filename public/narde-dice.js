export const dieRotation = value => ({1:[0,0],2:[0,-90],3:[-90,0],4:[90,0],5:[0,90],6:[0,180]})[value] || [0,0];
export const diePips = value => ({1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]})[value] || [];
export function diceSlots(game) {
  const pair=game.rolled.length?game.rolled:[0,0], remaining=[...game.dice];
  const capacity=pair[0] && pair[0]===pair[1]?2:1;
  return pair.map(value=>{
    let left=0;
    for(let i=0;i<capacity;i++){const index=remaining.indexOf(value);if(index>=0){remaining.splice(index,1);left++;}}
    return {value,left,capacity};
  });
}
export function isNardeRoll(previous,next,live=true) {
  return live && previous?.variant==='narde' && next?.variant==='narde' &&
    next.revision===previous.revision+1 && next.lastAction?.kind==='roll' && next.lastAction.revision===next.revision;
}
