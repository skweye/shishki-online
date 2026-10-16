import { TABLE, POCKETS, pocketGeometry, simulatePool } from './pool.js';

const R=TABLE.radius, GAP=2*R, FPS=60;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const inside=p=>p.x>=R&&p.x<=TABLE.width-R&&p.y>=R&&p.y<=TABLE.height-R;
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
function clear(a,b,obstacles){
  const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
  return obstacles.every(p=>{
    const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)>=GAP-.001;
  });
}
// Route the cue around stationary balls. Adjacent points on each clearance ring
// form short, collision-free bends; every segment is checked against the table.
function cueRoute(start,end,obstacles){
  if(!inside(end)||!clear(end,end,obstacles))return null;
  if(clear(start,end,obstacles))return [start,end];
  const nodes=[start,end];
  for(const ball of obstacles)for(let i=0;i<12;i++){
    const a=i*Math.PI/6,p={x:ball.x+Math.cos(a)*(GAP+.03),y:ball.y+Math.sin(a)*(GAP+.03)};
    if(inside(p)&&clear(p,p,obstacles))nodes.push(p);
  }
  const costs=nodes.map(()=>Infinity),previous=[],done=new Set();costs[0]=0;
  for(let step=0;step<nodes.length;step++){
    let best=-1;
    for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(best<0||costs[i]<costs[best]))best=i;
    if(best<0||!Number.isFinite(costs[best]))return null;
    if(best===1){const path=[];for(let i=1;i!==undefined;i=previous[i])path.unshift(nodes[i]);return path;}
    done.add(best);
    for(let i=0;i<nodes.length;i++)if(!done.has(i)){
      const cost=costs[best]+distance(nodes[best],nodes[i]);
      if(cost<costs[i]&&clear(nodes[best],nodes[i],obstacles)){costs[i]=cost;previous[i]=best;}
    }
  }
  return null;
}
const pathLength=path=>path.slice(1).reduce((sum,p,i)=>sum+distance(path[i],p),0);
function along(path,t){
  let remaining=pathLength(path)*t;
  for(let i=1;i<path.length;i++){const length=distance(path[i-1],path[i]);if(remaining<=length)return mix(path[i-1],path[i],length?remaining/length:1);remaining-=length;}
  return path.at(-1);
}

function sweepCandidates(balls,cue){
  const objects=balls.filter(b=>b.id!==0),targets=objects.some(b=>b.id!==8)?objects.filter(b=>b.id!==8):objects,candidates=[];
    for(const ball of targets)for(let pocket=0;pocket<POCKETS.length;pocket++){
      const end=pocketGeometry(POCKETS[pocket]),length=distance(ball,end);
      const direction={x:(end.x-ball.x)/length,y:(end.y-ball.y)/length};
      const contact={x:ball.x-direction.x*GAP,y:ball.y-direction.y*GAP};
      const ready={x:contact.x-direction.x*.16,y:contact.y-direction.y*.16};
      if(!inside(ready)||!clear(ready,contact,objects)||!clear(ball,end,objects.filter(b=>b!==ball)))continue;
      candidates.push({ball,end,pocket,contact,ready,cost:distance(cue,ready)+length*.4});
    }
    candidates.sort((a,b)=>a.cost-b.cost||a.ball.id-b.ball.id||a.pocket-b.pocket);

  return candidates;
}

// A scripted owner action, separate from normal pool physics. The server and
// renderer derive the same route from the position; no client result is trusted.
export function simulatePoolSweep(state,collectFrames=false){
  if(state.variant!=='pool8'||state.winner)throw Error('Удар сейчас недоступен.');
  const balls=state.balls.map(b=>({...b}));let cue=balls.find(b=>b.id===0),nudges=0;
  if(!cue)throw Error('Сначала поставьте биток на стол.');
  const frames=[],events=[],potted=[],shots=[];let elapsed=0;
  const frame=()=>balls.map(({id,x,y})=>({id,x,y}));
  if(collectFrames)frames.push(frame());
  function animate(duration,update){
    const steps=Math.ceil(duration*FPS);
    if(collectFrames)for(let i=1;i<=steps;i++){update(i/steps);frames.push(frame());}
    else update(1);
    elapsed+=steps/FPS;
  }
  while(balls.some(b=>b.id!==0)){
    const objects=balls.filter(b=>b.id!==0),candidates=sweepCandidates(balls,cue);
    let shot;
    for(const candidate of candidates){const route=cueRoute({...cue},candidate.ready,objects);if(route){shot={...candidate,route};break;}}
    if(!shot){
      // Open a tight cluster with a real collision before resuming the guided
      // sequence. Reject nudges that scratch or pocket the eight prematurely.
      let impulse;
      const targets=objects.filter(b=>b.id!==8).sort((a,b)=>distance(cue,a)-distance(cue,b));
      const position={...state,balls,winner:null,ballInHand:null};
      if(nudges++<12)outer:for(const target of targets)for(const power of [.35,.65,1])for(const offset of [0,.12,-.12]){
        const angle=Math.atan2(target.y-cue.y,target.x-cue.x)+offset,dx=Math.cos(angle)*power,dy=Math.sin(angle)*power;
        const result=simulatePool(position,dx,dy);
        if(result.potted.some(b=>b.id===0||b.id===8)||!sweepCandidates(result.balls,result.balls.find(b=>b.id===0)).length)continue;
        impulse={dx,dy};break outer;
      }
      if(!impulse)throw Error('Не удалось проложить путь битка. Сделайте обычный удар.');
      const result=simulatePool(position,impulse.dx,impulse.dy,true);
      if(collectFrames)frames.push(...result.frames.slice(1));
      events.push({time:elapsed,kind:'cue',strength:Math.hypot(impulse.dx,impulse.dy)},...result.events.map(e=>({...e,time:e.time+elapsed})));
      elapsed+=(result.frames.length-1)/FPS;
      potted.push(...result.potted);balls.splice(0,balls.length,...result.balls.map(b=>({...b})));cue=balls.find(b=>b.id===0);
      animate(.2,()=>{});continue;
    }
    const {ball,end,pocket,contact,ready,route}=shot,start={x:ball.x,y:ball.y};
    shots.push({id:ball.id,pocket,route,contact,start,end});
    animate(Math.max(.18,Math.min(.75,pathLength(route)/20)),t=>Object.assign(cue,along(route,t*t*(3-2*t))));
    animate(.09,t=>Object.assign(cue,mix(ready,contact,t*t)));
    events.push({time:elapsed,kind:'ball',strength:.65});
    animate(Math.max(.24,distance(start,end)/24),t=>Object.assign(ball,mix(start,end,1-(1-t)**2)));
    const index=balls.indexOf(ball);balls.splice(index,1);
    potted.push({id:ball.id,pocket});events.push({time:elapsed,kind:'pocket',id:ball.id,pocket,x:end.x,y:end.y,strength:.65});
    // Keep the rolling ball until it reaches the well, then use the shared sink effect.
    if(collectFrames)frames[frames.length-1]=frame();
    animate(.12,()=>{});
  }
  return {balls:frame(),frames,events,potted,shots};
}
