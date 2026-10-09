import { TABLE } from './pool.js';
export const BALL_COLORS=['#f6f1e6','#eebd32','#326ccc','#cb493d','#8155ae','#ed8739','#32836c','#923d4c','#20272d'];
export function shotVector(angle,power){
  const a=(Number.isFinite(angle)?angle:0)*Math.PI/180,p=Math.max(.05,Math.min(1,Number.isFinite(power)?power:.85));
  return {dx:Math.cos(a)*p,dy:Math.sin(a)*p};
}
export function poolAim(balls,angle){
  const cue=balls.find(b=>b.id===0);if(!cue)return null;
  const {dx,dy}=shotVector(angle,1),r=TABLE.radius;
  let distance=Infinity,hit=null;
  for(const [p,d,max] of [[cue.x,dx,TABLE.width],[cue.y,dy,TABLE.height]])if(Math.abs(d)>1e-9)distance=Math.min(distance,Math.max(0,((d>0?max-r:r)-p)/d));
  for(const b of balls)if(b.id){const x=b.x-cue.x,y=b.y-cue.y,along=x*dx+y*dy,perp=x*x+y*y-along*along;
    if(along<0||perp>4*r*r)continue;const contact=along-Math.sqrt(Math.max(0,4*r*r-perp));
    if(contact>=-1e-6&&contact<distance){distance=Math.max(0,contact);hit=b;}
  }
  const end={x:cue.x+dx*distance,y:cue.y+dy*distance};
  return {cue,end,hit,direction:{x:dx,y:dy},normal:hit?{x:(hit.x-end.x)/(2*r),y:(hit.y-end.y)/(2*r)}:null};
}
export function poolRack(state,side){
  const group=state.groups[side];if(!group)return [];
  return Array.from({length:7},(_,i)=>i+(group==='solid'?1:9)).map(id=>({id,potted:!state.balls.some(b=>b.id===id)}));
}
// Quaternion orientation is presentation-only; no spin is added to the physics.
export function rollOrientation(q,dx,dy){
  const distance=Math.hypot(dx,dy);if(distance<1e-10)return q;
  const half=distance/TABLE.radius/2,s=Math.sin(half),a=[-dy/distance*s,dx/distance*s,0,Math.cos(half)];
  const [x,y,z,w]=q,[u,v,k,t]=a;
  const result=[t*x+u*w+v*z-k*y,t*y-u*z+v*w+k*x,t*z+u*y-v*x+k*w,t*w-u*x-v*y-k*z],length=Math.hypot(...result);
  return result.map(n=>n/length);
}
export function rotateVector(q,[x,y,z]){
  const [a,b,c,w]=q,tx=2*(b*z-c*y),ty=2*(c*x-a*z),tz=2*(a*y-b*x);
  return [x+w*tx+b*tz-c*ty,y+w*ty+c*tx-a*tz,z+w*tz+a*ty-b*tx];
}
export function interpolatePoolFrame(frames,seconds){
  const index=Math.min(frames.length-1,Math.floor(seconds*60)),fraction=Math.min(1,seconds*60-index),next=new Map((frames[index+1]||frames[index]).map(b=>[b.id,b]));
  return frames[index].filter(b=>next.has(b.id)||fraction===0).map(b=>{const n=next.get(b.id)||b;return {...b,x:b.x+(n.x-b.x)*fraction,y:b.y+(n.y-b.y)*fraction};});
}

export function createBallPainter(){
  const size=48,sprite=document.createElement('canvas');sprite.width=sprite.height=size;
  const pen=sprite.getContext('2d'),pixels=pen.createImageData(size,size),surface=[];
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const x=(px+.5-size/2)/(size/2),y=(py+.5-size/2)/(size/2),d=x*x+y*y;
    if(d<=1){const z=Math.sqrt(1-d);surface.push({index:(py*size+px)*4,x,y,z,light:.53+.46*Math.max(0,-x*.35-y*.45+z*.82),shine:Math.pow(Math.max(0,-x*.32-y*.42+z*.847),36)*75});}
  }
  const rgb=BALL_COLORS.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))),cueInk=[150,70,50];
  return (ctx,ball,p,r,q=[0,0,0,1],flipped=false)=>{
    const inverse=[-q[0],-q[1],-q[2],q[3]],flip=flipped?-1:1,base=rgb[ball.id>8?ball.id-8:ball.id];
    const u=rotateVector(inverse,[flip,0,0]),v=rotateVector(inverse,[0,flip,0]),w=rotateVector(inverse,[0,0,1]);
    for(const {index,x,y,z,light,shine} of surface){
      const localY=x*u[1]+y*v[1]+z*w[1],localZ=x*u[2]+y*v[2]+z*w[2];
      const patch=ball.id&&Math.abs(localZ)>.88,white=patch||ball.id>8&&Math.abs(localY)>.52;
      const cueMark=ball.id===0&&Math.max(Math.abs(localY),Math.abs(localZ),Math.abs(x*u[0]+y*v[0]+z*w[0]))>.986;
      const color=cueMark?cueInk:white?rgb[0]:base;
      for(let k=0;k<3;k++)pixels.data[index+k]=Math.min(255,color[k]*light+shine);
      pixels.data[index+3]=Math.min(255,z*1700);
    }
    pen.putImageData(pixels,0,0);ctx.drawImage(sprite,p.x-r,p.y-r,r*2,r*2);
    if(ball.id){
      for(const sign of [1,-1]){
        const normal=rotateVector(q,[0,0,sign]);if(normal[2]<.25)continue;
        const u=rotateVector(q,[sign,0,0]),v=rotateVector(q,[0,1,0]);
        ctx.save();ctx.translate(p.x+normal[0]*flip*r*.99,p.y+normal[1]*flip*r*.99);
        ctx.transform(u[0]*flip,u[1]*flip,v[0]*flip,v[1]*flip,0,0);
        ctx.fillStyle='#172028';ctx.font=`bold ${r*.74}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ball.id,0,.5);ctx.restore();
      }
    }
  };
}
