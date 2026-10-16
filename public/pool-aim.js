// Ephemeral presentation only. Shot vectors are still validated separately.
export function validPoolAim(data,game,role){
  return game?.variant==='pool8'&&!game.winner&&role===game.turn&&
    data?.revision===game.revision&&Number.isInteger(data.revision)&&
    Number.isFinite(data.angle)&&Math.abs(data.angle)<=180&&
    Number.isFinite(data.power)&&data.power>=.05&&data.power<=1&&typeof data.placing==='boolean';
}
export const angleDelta=(from,to)=>((to-from+540)%360+360)%360-180;
