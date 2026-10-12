export const FLEET = Object.freeze([4,3,3,2,2,2,1,1,1,1]);
const other = side => side === 'white' ? 'black' : 'white';
const cellOK = cell => Number.isInteger(cell) && cell >= 0 && cell < 100;
export const seaCoordinate = cell => 'ABCDEFGHIJ'[cell % 10] + (Math.floor(cell / 10) + 1);
export function shipCells(start, length, vertical = false) {
  if (!cellOK(start) || !Number.isInteger(length) || length < 1 || length > 4) return [];
  if ((vertical ? Math.floor(start / 10) : start % 10) + length > 10) return [];
  return Array.from({length},(_,i)=>start+i*(vertical?10:1));
}
export function canPlaceShip(fleet, ship) {
  if (!Array.isArray(ship) || !ship.length || ship.length>4 || !ship.every(cellOK)) return false;
  const sorted=[...ship].sort((a,b)=>a-b);
  if (!shipCells(sorted[0],sorted.length,false).every((cell,i)=>cell===sorted[i]) || shipCells(sorted[0],sorted.length,false).length!==sorted.length) {
    const vertical=shipCells(sorted[0],sorted.length,true);
    if (vertical.length!==sorted.length || !vertical.every((cell,i)=>cell===sorted[i])) return false;
  }
  return !fleet.flat().some(a=>ship.some(b=>Math.abs(a%10-b%10)<=1 && Math.abs(Math.floor(a/10)-Math.floor(b/10))<=1));
}
export function validateFleet(fleet) {
  if (!Array.isArray(fleet) || fleet.length!==10 || fleet.some(ship=>!Array.isArray(ship)) || fleet.map(ship=>ship.length).sort((a,b)=>b-a).join()!==FLEET.join()) throw new Error('Нужны 10 прямых кораблей: 4, 3, 3, 2, 2, 2, 1, 1, 1, 1. Они не должны касаться.');
  const placed=[];
  for(const ship of fleet){if(!canPlaceShip(placed,ship))throw new Error('Корабли не должны пересекаться, касаться или выходить за поле.');placed.push([...ship].sort((a,b)=>a-b));}
  return placed;
}
export function randomFleet() {
  function fill(fleet,index){
    if(index===FLEET.length)return fleet;
    const candidates=[];
    for(let cell=0;cell<100;cell++)for(const vertical of [false,true]){const ship=shipCells(cell,FLEET[index],vertical);if(ship.length===FLEET[index]&&canPlaceShip(fleet,ship))candidates.push(ship);}
    for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
    for(const ship of candidates){const result=fill([...fleet,ship],index+1);if(result)return result;}
    return null;
  }
  return fill([],0);
}
export function newBattleship(){return {variant:'battleship',board:Array(100).fill(0),fleets:{white:[],black:[]},shots:{white:[],black:[]},ready:{white:false,black:false},phase:'setup',turn:'white',forced:null,captured:[],path:[],repetitions:{},history:[],revision:0,winner:null,reason:null};}
export function actBattleship(state,role,action){
  if(state.variant!=='battleship'||state.winner||!['white','black'].includes(role)||state.turn!==role)throw new Error('Действие сейчас недоступно.');
  const next=structuredClone(state),opponent=other(role);
  if(action.type==='fleet-ready'){
    if(state.phase!=='setup'||state.ready[role])throw new Error('Флот уже готов.');
    next.fleets[role]=validateFleet(action.fleet);next.ready[role]=true;
    next.turn=opponent;
    if(next.ready.white&&next.ready.black){next.phase='battle';next.turn='white';}
  }else if(action.type==='sea-fire'){
    if(state.phase!=='battle'||!cellOK(action.cell)||state.shots[role].some(shot=>shot.cell===action.cell))throw new Error('Выберите клетку, по которой ещё не стреляли.');
    const ship=state.fleets[opponent].find(ship=>ship.includes(action.cell));
    const sunk=ship&&ship.every(cell=>cell===action.cell||state.shots[role].some(shot=>shot.cell===cell));
    const result=sunk?'sunk':ship?'hit':'miss';
    next.shots[role].push({cell:action.cell,result,...(sunk?{sunkCells:[...ship]}:{})});
    next.history.push({side:role,notation:seaCoordinate(action.cell)+' · '+({miss:'○',hit:'✦',sunk:'⚓'}[result]),from:action.cell,to:action.cell,capture:ship?1:null});
    next.lastSeaShot={cell:action.cell,result,side:role,revision:state.revision+1};
    if(next.shots[role].filter(shot=>shot.result!=='miss').length===20){next.winner=role;next.reason='fleet-sunk';}
    else if(!ship)next.turn=opponent;
  }else throw new Error('Действие сейчас недоступно.');
  next.revision++;return next;
}
// Only the owner receives unhit ship locations, including on errors and reconnects.
export function battleshipView(state,role){
  if(state.variant!=='battleship')return state;
  const view=structuredClone(state);
  for(const side of ['white','black'])if(side!==role&&!state.winner)view.fleets[side]=state.shots[other(side)].filter(shot=>shot.result==='sunk').map(shot=>shot.sunkCells);
  return view;
}
