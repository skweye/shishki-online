import { validShipSkin } from './shop-catalog.js';

// Every model is drawn for its actual cell length, never stretched from a single sprite.
export function shipArt(length,skin='classic') {
  length=[1,2,3,4].includes(length)?length:1;
  skin=validShipSkin(skin);
  const width=length*100;
  if(skin!=='classic')return `<g class="sea-model sea-model-${skin}">${modelArt(width,skin)}</g>`;
  return `<path class="sea-hull-shadow" d="M10 55 Q25 17 65 17 H${width-28} Q${width-10} 17 ${width-10} 35 V75 Q${width-10} 85 ${width-28} 85 H65 Q25 85 10 55Z"/>
  <path class="sea-hull" d="M8 50 Q25 12 65 12 H${width-26} Q${width-12} 12 ${width-12} 30 V70 Q${width-12} 88 ${width-26} 88 H65 Q25 88 8 50Z"/>
  <path class="sea-deck" d="M23 50 Q38 25 65 25 H${width-28} V75 H65 Q38 75 23 50Z"/>
  <path class="sea-keel" d="M24 50 H${width-20}"/>
  <rect class="sea-cabin" x="${Math.max(40,width*.46)}" y="30" width="${Math.max(22,width*.2)}" height="40" rx="8"/>
  <path class="sea-windows" d="M${width*.53} 34 V66 M${width*.53+10} 34 V66"/>
  <circle class="sea-turret" cx="${length>1?65:35}" cy="50" r="13"/><path class="sea-gun" d="M${length>1?40:20} 50 H${length>1?65:35}"/>
  ${length>2?`<circle class="sea-turret" cx="${width-52}" cy="50" r="14"/><path class="sea-gun" d="M${width-52} 50 H${width-25}"/>`:''}
  <path class="sea-trim" d="M70 18 H${width-30} M70 82 H${width-30}"/>`;
}
export function shipSvg(ship,index=-1,extra='',skin='classic') {
  const vertical=ship.length>1&&ship[1]-ship[0]===10,x=ship[0]%10*100,y=Math.floor(ship[0]/10)*100;
  return `<g class="sea-vessel ${extra}" data-vessel="${index}" transform="translate(${x+(vertical?100:0)} ${y})${vertical?' rotate(90)':''}">${shipArt(ship.length,skin)}</g>`;
}

function modelArt(w,skin){
  const center=w/2;
  if(skin==='submarine')return `
    <path class="sea-model-shadow" d="M8 55Q12 22 45 22H${w-34}Q${w-12} 24 ${w-8} 55Q${w-12} 87 ${w-34} 87H45Q12 87 8 55Z"/>
    <path class="sea-fins" d="M${w-35} 45 ${w-27} 7 ${w-14} 7 ${w-18} 45M${w-35} 55 ${w-27} 93 ${w-14} 93 ${w-18} 55"/>
    <path class="sea-hull" d="M7 50Q9 21 43 21H${w-34}Q${w-14} 23 ${w-9} 50Q${w-14} 77 ${w-34} 79H43Q9 79 7 50Z"/>
    <path class="sea-sub-seam" d="M35 26V74 M${w-40} 25V75 M25 50H${w-20}"/>
    <rect class="sea-deck" x="${center-16}" y="32" width="34" height="36" rx="15"/>
    <path class="sea-periscope" d="M${center} 54V38H${center+12}"/>
    <circle class="sea-hatch" cx="${Math.max(27,center-44)}" cy="50" r="7"/>
    ${w>200?`<circle class="sea-hatch" cx="${center+55}" cy="50" r="8"/><path class="sea-sub-seam" d="M${center+36} 35H${w-49} M${center+36} 65H${w-49}"/>`:''}`;
  if(skin==='carrier'){
    const planes=Array.from({length:Math.max(1,w/100-1)},(_,i)=>{
      const x=30+i*83;return `<path class="sea-plane" d="M${x-12} 61H${x-2}L${x+6} 49H${x+10}L${x+7} 61H${x+17}V65H${x+7}L${x+10} 77H${x+6}L${x-2} 65H${x-12}L${x-16} 71H${x-19}L${x-16} 63 ${x-19} 55H${x-16}Z"/>`;
    }).join('');
    return `<path class="sea-model-shadow" d="M8 22 ${w-18} 22 ${w-7} 82 16 90Z"/><path class="sea-hull" d="M6 25 22 9H${w-19}L${w-8} 24V82L${w-22} 90H20L6 75Z"/>
      <path class="sea-deck" d="M16 27 28 17H${w-27}V81H24L16 70Z"/>
      <path class="sea-runway" d="M24 37H${w-30} M24 43H${w-30}"/><path class="sea-runway-dash" d="M28 40H${w-30}"/>
      <rect class="sea-cabin" x="${w-45}" y="14" width="22" height="17" rx="3"/><path class="sea-antenna" d="M${w-35} 23V10 M${w-42} 14H${w-28}"/>${planes}`;
  }
  if(skin==='viking'){
    const ribs=Array.from({length:w/50},(_,i)=>{
      const x=27+i*(w-54)/Math.max(1,w/50-1);return `<path class="sea-oar" d="M${x} 31 ${x-9} 4 M${x} 69 ${x-9} 96"/><circle class="sea-shield" cx="${x}" cy="26" r="7"/><circle class="sea-shield" cx="${x}" cy="74" r="7"/>`;
    }).join('');
    return `<path class="sea-model-shadow" d="M7 55Q${center} -7 ${w-7} 55Q${center} 114 7 55Z"/>
      <path class="sea-hull" d="M5 50Q${center} -5 ${w-5} 50Q${center} 105 5 50Z"/><path class="sea-deck" d="M17 50Q${center} 13 ${w-17} 50Q${center} 87 17 50Z"/>
      <path class="sea-planks" d="M24 43H${w-24}M24 57H${w-24}M17 50H${w-17}"/>${ribs}
      <path class="sea-mast" d="M${center-5} 15V85"/>
      <path class="sea-sail" d="M${center-4} 16Q${center+35} 32 ${center+24} 50Q${center+35} 68 ${center-4} 84Z"/>
      <path class="sea-sail-stripe" d="M${center-3} 31Q${center+19} 36 ${center+27} 42M${center-3} 51H${center+24}M${center-3} 71Q${center+19} 66 ${center+27} 59"/>`;
  }
  const bays=Array.from({length:Math.max(1,w/100-1)},(_,i)=>`<rect class="sea-missile" x="${24+i*57}" y="39" width="14" height="22" rx="2"/><path class="sea-missile-line" d="M${31+i*57} 41V59"/>`).join('');
  return `<path class="sea-model-shadow" d="M5 55 38 16 ${w-25} 25 ${w-8} 55 ${w-25} 85 38 94Z"/>
    <path class="sea-hull" d="M5 50 37 12 ${w-25} 22 ${w-8} 50 ${w-25} 78 37 88Z"/>
    <path class="sea-facet" d="M5 50 37 12 ${w-25} 22 ${w-8} 50 ${w-25} 40 37 30Z"/>
    <path class="sea-deck" d="M18 50 40 31 ${w-28} 40 ${w-19} 50 ${w-28} 66 40 71Z"/>${bays}
    <path class="sea-stealth-bridge" d="M${w-59} 30 ${w-29} 39 ${w-24} 50 ${w-29} 61 ${w-59} 70 ${w-50} 50Z"/>
    <path class="sea-light-strip" d="M40 19 ${w-30} 29M40 81 ${w-30} 71"/>`;
}

export function fleetPreview(skin){
  return `<svg class="ship-model-preview" viewBox="0 0 440 235" aria-hidden="true"><g transform="translate(20 10)">${shipArt(4,skin)}</g><g transform="translate(20 125)">${shipArt(2,skin)}</g><g transform="translate(310 125)">${shipArt(1,skin)}</g></svg>`;
}
