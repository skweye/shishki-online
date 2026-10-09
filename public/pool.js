// Deterministic, fixed-step, top-down pool. No spin or airborne balls.
export const TABLE = Object.freeze({ width:20, height:10, radius:.27, pocket:.62 });
export const POCKETS = Object.freeze([{x:0,y:0},{x:10,y:0},{x:20,y:0},{x:0,y:10},{x:10,y:10},{x:20,y:10}]);
// Shared by physics and rendering: middle openings sit deeper in the rail.
export const pocketGeometry=p=>({x:p.x,y:p.y+(p.x===10?(p.y===0?-12:12)/54:0),radius:(p.x===10?29:32)/54});
const R=TABLE.radius, DT=1/240, MAX_SPEED=36, DRAG=2.8;
const opposite=side=>side==='white'?'black':'white';
export const ballGroup=id=>id>=1&&id<=7?'solid':id>=9&&id<=15?'stripe':null;
export const remainingPool=(state,side)=>state.groups[side]?state.balls.filter(b=>ballGroup(b.id)===state.groups[side]).length:7;
export function poolTargets(state) {
  if(!state.groups[state.turn])return state.balls.filter(b=>ballGroup(b.id)).map(b=>b.id);
  const targets=state.balls.filter(b=>ballGroup(b.id)===state.groups[state.turn]).map(b=>b.id);
  return targets.length?targets:[8];
}
export function newPool() {
  const ids=[1,10,2,3,8,11,12,4,13,5,6,14,7,15,9],balls=[{id:0,x:4.5,y:5}];let i=0;
  for(let row=0;row<5;row++)for(let col=0;col<=row;col++)balls.push({id:ids[i++],x:14.5+row*(Math.sqrt(3)*R+.003),y:5+(col-row/2)*(2*R+.003)});
  return {variant:'pool8',board:Array(16).fill(0),balls,turn:'white',groups:{white:null,black:null},breaking:true,
    ballInHand:'kitchen',foul:null,lastShot:null,forced:null,captured:[],path:[],repetitions:{},history:[],revision:0,winner:null,reason:null};
}
export function validCuePosition(state,x,y) {
  return [x,y].every(Number.isFinite)&&x>=R&&x<=20-R&&y>=R&&y<=10-R&&
    (state.ballInHand!=='kitchen'||x<5)&&!POCKETS.some(p=>Math.hypot(x-p.x,y-p.y)<TABLE.pocket+R*.3)&&
    !state.balls.some(b=>b.id!==0&&Math.hypot(x-b.x,y-b.y)<2*R+.002);
}
export function placePoolCue(state,x,y) {
  if(state.variant!=='pool8'||state.winner||!state.ballInHand||!validCuePosition(state,x,y))throw new Error('Поставьте биток на свободное место в разрешённой зоне.');
  const next=structuredClone(state);next.balls=next.balls.filter(b=>b.id!==0);next.balls.push({id:0,x,y});next.revision++;
  return next;
}
export function simulatePool(state,dx,dy,collectFrames=false) {
  if(state.variant!=='pool8'||state.winner)throw new Error('Удар сейчас недоступен.');
  if(![dx,dy].every(v=>typeof v==='number'&&Number.isFinite(v))||Math.hypot(dx,dy)<.05-1e-8||Math.hypot(dx,dy)>1.000001)throw new Error('Сила удара должна быть от 5 до 100%.');
  const cue=state.balls.find(b=>b.id===0);if(!cue)throw new Error('Сначала поставьте биток на стол.');
  if(state.ballInHand&&!validCuePosition(state,cue.x,cue.y))throw new Error('Поставьте биток на свободное место в разрешённой зоне.');
  const balls=state.balls.map(b=>({...b,vx:b.id===0?dx*MAX_SPEED:0,vy:b.id===0?dy*MAX_SPEED:0,out:false}));
  const frames=[],collisions=[],events=[],potted=[],railBalls=new Set();let firstContact=null,firstContactX=null,railAfterContact=false,time=0;
  const frame=()=>balls.filter(b=>!b.out).map(({id,x,y})=>({id,x,y}));
  if(collectFrames)frames.push(frame());
  function rails(b) {
    const pocket=POCKETS.findIndex(p=>{const g=pocketGeometry(p);return Math.hypot(b.x-g.x,b.y-g.y)<g.radius-R*.35;});
    if(pocket>=0){if(collectFrames)events.push({time,kind:'pocket',id:b.id,pocket,x:b.x,y:b.y,strength:Math.min(1,Math.hypot(b.vx,b.vy)/20)});b.out=true;b.vx=b.vy=0;potted.push({id:b.id,pocket});return;}
    let hit=false;
    if(b.x<R){b.x=R;if(b.vx<0){b.vx=-b.vx*.82;hit=true;}}
    if(b.x>20-R){b.x=20-R;if(b.vx>0){b.vx=-b.vx*.82;hit=true;}}
    // Leave an actual opening in the middle cushion; nearby parallel shots stay on the cloth.
    const middleMouth=Math.abs(b.x-10)<.38;
    if(b.y<R&&!middleMouth){b.y=R;if(b.vy<0){b.vy=-b.vy*.82;hit=true;}}
    if(b.y>10-R&&!middleMouth){b.y=10-R;if(b.vy>0){b.vy=-b.vy*.82;hit=true;}}
    if(hit){if(b.id)railBalls.add(b.id);if(firstContact!==null)railAfterContact=true;if(collectFrames)events.push({time,kind:'rail',strength:Math.min(1,Math.hypot(b.vx,b.vy)/25)});}
  }
  for(let step=0;step<2400;step++){
    time=(step+1)*DT;
    for(const b of balls)if(!b.out){b.x+=b.vx*DT;b.y+=b.vy*DT;rails(b);}
    for(let pass=0;pass<2;pass++)for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
      const a=balls[i],b=balls[j];if(a.out||b.out)continue;
      const x=b.x-a.x,y=b.y-a.y,d=Math.hypot(x,y);if(d>=2*R)continue;
      const nx=d>1e-9?x/d:1,ny=d>1e-9?y/d:0,overlap=(2*R-d+.000001)/2;
      a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
      const approach=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
      if(approach>0){
        if(firstContact===null&&(a.id===0||b.id===0)){firstContact=a.id===0?b.id:a.id;firstContactX=a.id===0?b.x:a.x;}
        const impulse=approach*.985;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;
        if(collectFrames&&approach>.4)events.push({time,kind:'ball',strength:Math.min(1,approach/25)});
        if(collectFrames&&approach>1&&(!collisions.length||step*DT-collisions.at(-1)>.08))collisions.push(step*DT);
      }
    }
    for(const b of balls)if(!b.out){rails(b);const speed=Math.hypot(b.vx,b.vy),scale=speed?Math.max(0,speed-DRAG*DT)/speed:0;b.vx*=scale;b.vy*=scale;}
    if(collectFrames&&step%4===3)frames.push(frame());
    if(balls.every(b=>b.out||Math.hypot(b.vx,b.vy)<.012))break;
  }
  const result={balls:frame().map(b=>({...b,x:Math.round(b.x*1e6)/1e6,y:Math.round(b.y*1e6)/1e6})),potted,firstContact,firstContactX,railAfterContact,railBalls:[...railBalls]};
  if(collectFrames)frames.push(result.balls);
  return {...result,frames,collisions,events};
}
function spotEight(balls) {
  for(let i=0;i<110;i++){
    const x=14.5+(i%2?1:-1)*Math.ceil(i/2)*.08,y=5;
    if(x>=R&&x<=20-R&&!balls.some(b=>Math.hypot(b.x-x,b.y-y)<2*R+.002)){balls.push({id:8,x,y});return;}
  }
  for(let y=R;y<10-R;y+=2*R+.01)for(let x=R;x<20-R;x+=2*R+.01)if(!balls.some(b=>Math.hypot(b.x-x,b.y-y)<2*R+.002)){balls.push({id:8,x,y});return;}
}
// Pure adjudication also permits precise foul/endgame regression fixtures.
export function resolvePool(state, result, command) {
  const next=structuredClone(state),side=state.turn,other=opposite(side),eight=result.potted.some(b=>b.id===8),scratch=result.potted.some(b=>b.id===0);
  next.balls=result.balls;next.revision++;next.breaking=false;next.ballInHand=null;next.foul=null;
  if(scratch)next.foul='scratch';
  else if(result.firstContact===null)next.foul='no-contact';
  else if(!state.breaking&&!poolTargets(state).includes(result.firstContact))next.foul='wrong-ball';
  else if(state.ballInHand==='kitchen'&&result.firstContactX<5)next.foul='kitchen';
  else if(!result.potted.some(b=>b.id!==0)&&!result.railAfterContact)next.foul='no-rail';
  const invalidBreak=state.breaking&&!result.potted.some(b=>b.id!==0)&&result.railBalls.length<4;
  if(invalidBreak)next.foul='break';
  if(state.breaking){
    if(eight)spotEight(next.balls);
    if(next.foul){next.turn=other;next.ballInHand='kitchen';}
    else next.turn=result.potted.some(b=>b.id!==0)?side:other;
  } else if(eight){
    const won=!next.foul&&state.groups[side]&&remainingPool(state,side)===0;
    next.winner=won?side:other;next.reason=won?'eight-ball':'illegal-eight';
  } else if(next.foul){next.turn=other;next.ballInHand='any';}
  else {
    const first=result.potted.find(b=>ballGroup(b.id));
    if(!state.groups[side]&&first){
      next.groups[side]=ballGroup(first.id);next.groups[other]=next.groups[side]==='solid'?'stripe':'solid';
    }
    next.turn=result.potted.some(b=>ballGroup(b.id)===next.groups[side]&&ballGroup(b.id))?side:other;
  }
  next.lastShot={dx:command.dx,dy:command.dy,revision:next.revision,potted:result.potted,foul:next.foul};
  next.history.push({side,from:0,to:0,capture:result.potted.some(b=>b.id!==0)?1:null,notation:(state.breaking?'△':'↗')+(result.potted.length?' · '+result.potted.map(b=>b.id===0?'○':b.id).join(','):' · —')+(next.foul?' ⚠':'')});
  return next;
}
export function applyPoolShot(state, command) {
  if(state.variant!=='pool8'||state.winner)throw new Error('Удар сейчас недоступен.');
  if(!command||typeof command!=='object')throw new Error('Некорректный удар.');
  return resolvePool(state,simulatePool(state,command.dx,command.dy),command);
}
