import { CATALOG } from './shop-catalog.js';

export const RARITIES=Object.freeze({
  common:{name:'Обычный',duplicate:20},rare:{name:'Редкий',duplicate:40},
  epic:{name:'Эпический',duplicate:90},legendary:{name:'Легендарный',duplicate:180}
});
export function rarityOf(item){
  if(!item?.price)return 'base';
  if(item.id==='effect-eclipse'||item.price>=480)return 'legendary';
  if(['effect-portal','effect-comet','ship-stealth'].includes(item.id)||item.price>=180)return 'epic';
  return item.price>100?'rare':'common';
}
export const CASES=Object.freeze([
  {id:'standard',name:'Кейс путешественника',price:100,odds:{common:70,rare:24,epic:5,legendary:1}},
  {id:'premium',name:'Кейс мастера',price:250,odds:{common:35,rare:45,epic:17,legendary:3}},
  {id:'royal',name:'Королевский кейс',price:500,odds:{common:0,rare:50,epic:40,legendary:10}}
]);
export const caseById=id=>CASES.find(box=>box.id===id);
export const casePool=rarity=>CATALOG.filter(item=>item.price>0&&rarityOf(item)===rarity);
export function caseContents(box){
  return Object.entries(box.odds).flatMap(([rarity,chance])=>chance?casePool(rarity).map(item=>({item,rarity,chance:chance/casePool(rarity).length})):[]);
}
export function selectCaseItem(box,rarityRoll,itemRoll){
  if(![rarityRoll,itemRoll].every(n=>Number.isFinite(n)&&n>=0&&n<1))throw new Error('Invalid random sample');
  let remaining=rarityRoll*100;
  for(const [rarity,chance] of Object.entries(box.odds)){
    if(remaining<chance){const pool=casePool(rarity);return pool[Math.floor(itemRoll*pool.length)];}
    remaining-=chance;
  }
  throw new Error('Invalid case odds');
}
export const matchXP=(result,moves)=>Number.isInteger(moves)&&moves>=4?({win:100,draw:60,loss:40}[result]||0):0;
export const levelThreshold=level=>25*(level-1)*(level+6);
export function progression(xp=0){
  xp=Number.isFinite(xp)?Math.max(0,Math.floor(xp)):0;
  let level=1+Math.floor((Math.sqrt(49+4*xp/25)-7)/2);
  // Correct rounding at exact boundaries without iterating through all levels.
  if(levelThreshold(level+1)<=xp)level++;
  if(levelThreshold(level)>xp)level--;
  const milestones=Math.floor(level/10),royal=Math.floor(level/50);
  return {xp,level,current:xp-levelThreshold(level),required:200+50*(level-1),nextCaseLevel:(milestones+1)*10,
    earned:{standard:milestones-Math.floor(level/20)-royal+Math.floor(level/100),premium:Math.floor(level/20)-Math.floor(level/100),royal}};
}
export const milestoneCase=level=>level%50===0?'royal':level%20===0?'premium':'standard';
