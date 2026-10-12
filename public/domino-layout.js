// Shared table geometry. Clients choose a direction; the server derives all positions.
export const DOMINO_DIRECTIONS = Object.freeze({right:[1,0],down:[0,1],left:[-1,0],up:[0,-1]});
const cells=p=>[[p.x,p.y],[p.x+p.dx,p.y+p.dy]];
const key=([x,y])=>`${x},${y}`;
const occupied=layout=>new Set(layout.flatMap(tile=>cells(tile.placement).map(key)));

function options(layout,end){
  if(!layout.length)return ['right','down'].map(direction=>({end:'right',direction,placement:{x:0,y:0,dx:DOMINO_DIRECTIONS[direction][0],dy:DOMINO_DIRECTIONS[direction][1]}}));
  const tile=end==='left'?layout[0]:layout.at(-1),p=tile.placement;
  const [x,y]=cells(p)[end==='left'?0:1],taken=occupied(layout);
  return Object.entries(DOMINO_DIRECTIONS).flatMap(([direction,[dx,dy]])=>{
    const near=[x+dx,y+dy],far=[x+2*dx,y+2*dy];
    if(taken.has(key(near))||taken.has(key(far)))return [];
    return [{end,direction,placement:end==='left'?{x:far[0],y:far[1],dx:-dx||0,dy:-dy||0}:{x:near[0],y:near[1],dx,dy}}];
  });
}

function folded(chain){
  let x=-1,y=0,dir=1;
  return chain.map((tile,i)=>{
    const dx=i%6===5?0:dir,dy=i%6===5?1:0;
    const placement={x:x+dx,y:y+dy,dx,dy};x+=2*dx;y+=2*dy;
    if(dy)dir=-dir;
    return {...tile,placement};
  });
}

export function dominoLayout(chain){
  if(!chain.length)return [];
  const valid=chain.every(({placement:p})=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&Math.abs(p.x)<=60&&Math.abs(p.y)<=60&&Object.values(DOMINO_DIRECTIONS).some(([dx,dy])=>p.dx===dx&&p.dy===dy));
  if(!valid)return folded(chain);
  const layout=chain.map(tile=>({...tile,placement:{...tile.placement}}));
  const connected=layout.every((tile,i)=>{if(!i)return true;const prev=cells(layout[i-1].placement)[1],next=cells(tile.placement)[0];return Math.abs(prev[0]-next[0])+Math.abs(prev[1]-next[1])===1;});
  // Shape never changes the rules: unfold a boxed-in end instead of preventing a legal move.
  if(!connected||occupied(layout).size!==chain.length*2||!options(layout,'left').length||!options(layout,'right').length)return folded(chain);
  return layout;
}

export function dominoPlacements(chain,end){return options(dominoLayout(chain),end);}
export function placeDomino(chain,tile,end,direction){
  const layout=dominoLayout(chain),choices=options(layout,end);
  const choice=direction===undefined?choices[0]:choices.find(item=>item.direction===direction);
  if(!choice)throw new Error('Здесь нельзя разместить кость. Выберите подсвеченное место.');
  const placed={...tile,placement:choice.placement};
  return dominoLayout(end==='left'?[placed,...layout]:[...layout,placed]);
}

export function dominoBounds(layout,choices=[]){
  const points=[...layout.map(tile=>tile.placement),...choices.map(choice=>choice.placement)].flatMap(cells);
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const minX=Math.min(-3,...xs)-1,minY=Math.min(-2,...ys)-1,maxX=Math.max(3,...xs)+2,maxY=Math.max(2,...ys)+2;
  return {x:minX,y:minY,width:maxX-minX,height:maxY-minY};
}

export function dominoDropTarget(choices,bounds,rect,clientX,clientY){
  if(!rect.width||!rect.height||clientX<rect.left||clientX>rect.left+rect.width||clientY<rect.top||clientY>rect.top+rect.height)return null;
  const scale=Math.min(rect.width/bounds.width,rect.height/bounds.height);
  const x=bounds.x+(clientX-rect.left-(rect.width-bounds.width*scale)/2)/scale;
  const y=bounds.y+(clientY-rect.top-(rect.height-bounds.height*scale)/2)/scale;
  let nearest=null,distance=Infinity;
  for(const choice of choices){const p=choice.placement,cx=p.x+.5+p.dx/2,cy=p.y+.5+p.dy/2,d=Math.hypot(x-cx,y-cy);if(d<distance&&d<=1.15){nearest=choice;distance=d;}}
  return nearest;
}
