// SVG ship silhouettes share the board coordinate system; no external assets or inline CSS.
export function shipArt(length) {
  const width=length*100;
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
export function shipSvg(ship,index=-1,extra='') {
  const vertical=ship.length>1&&ship[1]-ship[0]===10,x=ship[0]%10*100,y=Math.floor(ship[0]/10)*100;
  return `<g class="sea-vessel ${extra}" data-vessel="${index}" transform="translate(${x+(vertical?100:0)} ${y})${vertical?' rotate(90)':''}">${shipArt(ship.length)}</g>`;
}
