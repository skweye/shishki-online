// Effects use one square stage: circles and trajectories keep the same scale on both axes.
export function finishLayout(width,height,surface={left:0,top:0,width,height}) {
  const left=Math.max(0,Math.min(width,surface.left)),top=Math.max(0,Math.min(height,surface.top));
  const w=Math.max(0,Math.min(width-left,surface.width)),h=Math.max(0,Math.min(height-top,surface.height));
  return {left,top,width:w,height:h,size:Math.min(w,h)};
}

export function measureFinishLayout(frame){
  const bounds=frame.getBoundingClientRect(),width=frame.clientWidth,height=frame.clientHeight;
  const scaleX=bounds.width/(frame.offsetWidth||bounds.width)||1,scaleY=bounds.height/(frame.offsetHeight||bounds.height)||1;
  const surfaces=frame.querySelectorAll('.sea-fields, #pool-canvas, #narde-board, #board, #chapaev-canvas, #domino-board, .preview-checkers');
  for(const surface of surfaces){
    const rect=surface.getBoundingClientRect();
    if(!rect.width||!rect.height||surface.closest('[hidden]'))continue;
    return finishLayout(width,height,{left:(rect.left-bounds.left)/scaleX-frame.clientLeft,top:(rect.top-bounds.top)/scaleY-frame.clientTop,width:rect.width/scaleX,height:rect.height/scaleY});
  }
  return finishLayout(width,height);
}
