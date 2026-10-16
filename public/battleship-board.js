import { FLEET, shipCells, canPlaceShip, randomFleet, battleshipView, seaCoordinate } from './battleship.js';
import { shipArt, shipSvg, sunkExplosion } from './battleship-art.js';
import { t } from './i18n.js';

export function createBattleshipBoard(action){
  const root=document.getElementById('battleship-board');
  let state,options,draft=FLEET.map(()=>null),selected=0,vertical=false,unlocked=null,key=null,error='',drag=null,suppressClick=false,effect=null,effectTimer;
  const opposite=side=>side==='white'?'black':'white';
  const side=()=>options.mode==='local'?state.turn:options.role||'white';
  const editable=()=>state?.phase==='setup'&&!state.winner&&!state.ready[side()]&&options.enabled&&(options.mode!=='local'||unlocked===key);
  const button=(label,command,disabled=false)=>disabled&&['remove','clear'].includes(command)?'':`<button type="button" class="${command==='clear'?'danger-button':command==='hide'?'ghost-button':'secondary-button'}" data-sea-action="${command}" ${disabled?'disabled':''}>${t(label)}</button>`;
  const fleet=()=>draft.filter(Boolean);
  function candidate(index,cell,rotation){
    const ship=shipCells(cell,FLEET[index],rotation);
    return {ship,valid:ship.length===FLEET[index]&&canPlaceShip(draft.filter((s,i)=>s&&i!==index),ship)};
  }
  function place(index,cell){
    const result=candidate(index,cell,vertical);
    if(result.valid){draft[index]=result.ship;selected=draft.findIndex(s=>!s);if(selected<0)selected=index;error='';}
    else error='Здесь корабль не помещается или касается другого.';
  }
  function dock(){
    return `<div class="sea-dock" aria-label="${t('Расстановка флота')}">${FLEET.map((length,index)=>`<button type="button" class="sea-dock-ship ${selected===index?'is-selected':''} ${draft[index]?'is-placed':''}" data-sea-ship="${index}" aria-pressed="${selected===index}" aria-label="${t('Корабль')} ${index+1}: ${length}" ${options.enabled?'':'disabled'}><svg viewBox="0 0 ${length*100} 100" aria-hidden="true">${shipArt(length,options.skins?.[side()])}</svg><span>${length} ${draft[index]?'✓':''}</span></button>`).join('')}</div>`;
  }
  function grid(owner,own,view,enabled,setup){
    const ships=setup?draft:view.fleets[owner],cells=ships.filter(Boolean).flat(),shots=view.shots[opposite(owner)],sunk=shots.flatMap(shot=>shot.sunkCells||[]);
    let html=`<div class="sea-map ${setup?'is-editing':''}" data-sea-map="${own?'own':'enemy'}"><div class="sea-grid"><span></span>`+'ABCDEFGHIJ'.split('').map(letter=>`<span class="sea-axis">${letter}</span>`).join('');
    for(let row=0;row<10;row++){
      html+=`<span class="sea-axis">${row+1}</span>`;
      for(let col=0;col<10;col++){
        const cell=row*10+col,shot=shots.find(shot=>shot.cell===cell),ship=cells.includes(cell);
        const status=sunk.includes(cell)?'sunk':shot?shot.result:ship?'ship':'water';
        const label=t({sunk:'Потоплен',hit:'Попадание',miss:'Мимо',ship:'Корабль',water:'Вода'}[status]);
        const interactive=enabled&&(setup||!own&&!shot);
        html+=`<button type="button" class="sea-cell sea-${status}" data-sea-cell="${cell}" data-sea-own="${own}" aria-label="${seaCoordinate(cell)}: ${label}" ${interactive?'':'disabled'}>${status==='hit'||status==='sunk'?'×':status==='miss'?'·':''}</button>`;
      }
    }
    html+='</div><svg class="sea-vessels" viewBox="0 0 1000 1000" aria-hidden="true">';
    html+=ships.map((ship,index)=>ship?shipSvg(ship,index,`${ship.every(cell=>sunk.includes(cell))?'is-sunk':''} ${setup&&index===selected?'is-selected':''}`,options.skins?.[owner]):'').join('');
    html+=shots.filter(shot=>shot.result!=='miss').map(shot=>`<g class="sea-damage" transform="translate(${shot.cell%10*100+50} ${Math.floor(shot.cell/10)*100+50})"><circle r="17"/><path d="M-9-9 9 9 M9-9-9 9"/></g>`).join('');
    if(effect&&effect.side===opposite(owner)){
      if(effect.result==='sunk')html+=sunkExplosion(shots.find(shot=>shot.cell===effect.cell)?.sunkCells||[effect.cell]);
      else html+=`<g class="sea-shot-effect sea-effect-${effect.result}" transform="translate(${effect.cell%10*100+50} ${Math.floor(effect.cell/10)*100+50})"><circle class="sea-wave wave-one" r="20"/><circle class="sea-wave wave-two" r="20"/><circle class="sea-flash" r="24"/><path class="sea-spray" d="M0-32V-65 M24-24 47-47 M32 0H65 M24 24 47 47 M0 32V65 M-24 24-47 47 M-32 0H-65 M-24-24-47-47"/></g>`;
    }
    return html+'<g class="sea-placement-preview"></g></svg></div>';
  }
  function draw(){
    if(!state)return;
    const own=side();
    if(options.mode==='local'&&!state.winner&&unlocked!==key){
      root.innerHTML=`<div class="sea-curtain"><span aria-hidden="true">⚓</span><h3>${t(own==='white'?'Передайте устройство белым':'Передайте устройство чёрным')}</h3><p>${t('Откройте поле, когда соперник отвернётся.')}</p>${button('Открыть моё поле','reveal')}</div>`;return;
    }
    const view=battleshipView(state,own),setup=state.phase==='setup',editing=setup&&!state.ready[own]&&!state.winner,enabled=options.enabled;
    const hits=state.shots[own].filter(shot=>shot.result!=='miss').length,count=fleet().length;
    let html=`<div class="sea-heading"><span aria-hidden="true">⚓</span><div><h3>${t(setup?'Расстановка флота':'Морской бой')}</h3><p>${t(setup?'Корабли не касаются даже углами.':'Попадание даёт ещё один выстрел.')}</p></div><strong>${setup?(editing?count:10)+' / 10':hits+' / 20'}</strong></div>`;
    if(editing)html+=`<div class="sea-tools">${button('Расставить случайно','random',!enabled)}${button(vertical?'Вертикально ↕':'Горизонтально ↔','rotate',!enabled)}${button('Вернуть корабль','remove',!enabled||!draft[selected])}${button('Очистить поле','clear',!enabled||!count)}</div><p class="sea-instruction">${t('Перетащите корабль на поле. Колёсико или R — поворот. Можно выбрать корабль и нажать клетку.')}</p>${dock()}`;
    else if(setup)html+=`<p class="sea-instruction">${t('Соперник расставляет корабли. Ваш флот скрыт от него.')}</p>`;
    html+=`<p class="sea-error" role="alert">${t(error)}</p><div class="sea-fields"><section><h4>${t('Ваш флот')}</h4>${grid(own,true,view,enabled&&editing,editing)}</section>`;
    if(!setup)html+=`<section><h4>${t('Поле соперника')}</h4>${grid(opposite(own),false,view,enabled,false)}</section>`;
    html+='</div>';
    if(editing)html+=`<button type="button" class="primary-button sea-ready" data-sea-action="ready" ${enabled&&count===10?'':'disabled'}>${t('Флот готов — в бой')}</button>`;
    const last=state.lastSeaShot;
    if(!setup)html+=`<p class="sea-result" role="status">${last?seaCoordinate(last.cell)+' · '+t({miss:'Мимо',hit:'Попадание',sunk:'Потоплен'}[last.result]):t('Выберите клетку на поле соперника.')}</p>`;
    if(options.mode==='local'&&!state.winner)html+=button('Скрыть моё поле','hide');
    root.innerHTML=html;
  }
  function select(index){selected=index;if(draft[index]?.length>1)vertical=draft[index][1]-draft[index][0]===10;}
  function rotate(){vertical=!vertical;if(drag){preview();return;}draw();}
  root.addEventListener('click',event=>{
    if(suppressClick){event.preventDefault();return;}
    const target=event.target.closest('button');if(!target||target.disabled)return;
    const command=target.dataset.seaAction;
    if(command==='reveal'){unlocked=key;draw();return;}
    if(command==='hide'){hide();return;}
    if(!options.enabled)return;
    error='';
    if(target.dataset.seaShip!==undefined){select(Number(target.dataset.seaShip));draw();return;}
    if(command==='random'){draft=randomFleet();selected=0;}
    else if(command==='rotate'){rotate();return;}
    else if(command==='remove')draft[selected]=null;
    else if(command==='clear'){draft=FLEET.map(()=>null);selected=0;}
    else if(command==='ready'){action({type:'fleet-ready',fleet:fleet()});return;}
    else if(target.dataset.seaCell!==undefined){
      const cell=Number(target.dataset.seaCell);
      if(editable()){
        const index=draft.findIndex(ship=>ship?.includes(cell));
        if(index>=0)select(index);else place(selected,cell);
      }else if(state.phase==='battle'&&target.dataset.seaOwn==='false'){action({type:'sea-fire',cell});return;}
    }
    draw();
  });
  function dragCell(){
    const rect=root.querySelector('[data-sea-map="own"] .sea-vessels')?.getBoundingClientRect();
    if(!rect?.width||!rect.height)return -1;
    const col=Math.floor((drag.x-rect.left)/rect.width*10),row=Math.floor((drag.y-rect.top)/rect.height*10);
    if(col<0||col>9||row<0||row>9)return -1;
    const startCol=col-(vertical?0:drag.offset),startRow=row-(vertical?drag.offset:0);
    return startCol<0||startRow<0?-1:startRow*10+startCol;
  }
  function preview(){
    if(!drag?.moved)return;
    const cell=dragCell(),result=candidate(drag.index,cell,vertical),layer=root.querySelector('.sea-placement-preview');
    root.classList.add('is-dragging');
    root.querySelectorAll('.sea-preview-valid,.sea-preview-invalid').forEach(el=>el.classList.remove('sea-preview-valid','sea-preview-invalid'));
    root.querySelectorAll('.sea-vessel').forEach(el=>el.classList.toggle('is-drag-source',Number(el.dataset.vessel)===drag.index));
    if(layer)layer.innerHTML=result.ship.length?shipSvg(result.ship,-1,`sea-ghost ${result.valid?'is-valid':'is-invalid'}`,options.skins?.[side()]):'';
    for(const position of result.ship)root.querySelector(`[data-sea-own="true"][data-sea-cell="${position}"]`)?.classList.add(result.valid?'sea-preview-valid':'sea-preview-invalid');
  }
  function cancelDrag(redraw=true){
    const previous=drag;drag=null;root.classList.remove('is-dragging');
    if(previous?.capture.hasPointerCapture?.(previous.pointerId))previous.capture.releasePointerCapture(previous.pointerId);
    if(redraw)draw();
  }
  root.addEventListener('pointerdown',event=>{
    if(!editable()||event.button!==0||drag)return;
    const dockShip=event.target.closest('[data-sea-ship]'),cell=event.target.closest('[data-sea-own="true"]');
    const index=dockShip?Number(dockShip.dataset.seaShip):cell?draft.findIndex(ship=>ship?.includes(Number(cell.dataset.seaCell))):-1;
    if(index<0)return;
    select(index);
    const capture=dockShip||cell;
    drag={index,capture,pointerId:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,offset:cell?draft[index].indexOf(Number(cell.dataset.seaCell)):0,moved:false};
    capture.setPointerCapture?.(event.pointerId);
  });
  root.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)>5)drag.moved=true;
    preview();
  });
  root.addEventListener('pointerup',event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    const moved=drag.moved;
    if(moved){const cell=dragCell();if(cell>=0)place(drag.index,cell);suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}
    cancelDrag(moved);
  });
  root.addEventListener('pointercancel',()=>cancelDrag());
  root.addEventListener('lostpointercapture',()=>{if(drag)cancelDrag();});
  root.addEventListener('wheel',event=>{
    if(!drag||!event.deltaY)return;
    event.preventDefault();
    // A trackpad emits several events for one gesture; avoid accidental full rotations.
    const now=Date.now();if(now-(drag.lastRotate||0)<150)return;
    drag.lastRotate=now;drag.moved=true;rotate();
  },{passive:false});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&drag){event.preventDefault();cancelDrag();return;}
    if(editable()&&(event.code==='KeyR'||event.key.toLowerCase()==='r')){event.preventDefault();rotate();}
  });
  function hide(){cancelDrag(false);unlocked=null;effect=null;clearTimeout(effectTimer);if(state)draw();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelDrag(false);effect=null;clearTimeout(effectTimer);if(options?.mode==='local')unlocked=null;draw();}});
  window.addEventListener('blur',()=>{if(options?.mode==='local')hide();else if(drag)cancelDrag();});
  document.addEventListener('languagechange',()=>{cancelDrag(false);draw();});
  return {hide,render(next,opts){
    const nextKey=[opts.mode,opts.roomCode||'',opts.mode==='local'?next.turn:opts.role,next.phase].join(':');
    const reset=nextKey!==key||next.revision<state?.revision||next.phase==='setup'&&state?.winner;
    if(reset){cancelDrag(false);unlocked=null;draft=FLEET.map(()=>null);selected=0;error='';effect=null;clearTimeout(effectTimer);}
    if(!reset&&!document.hidden&&next.revision===state?.revision+1&&next.lastSeaShot?.revision===next.revision){
      effect=next.lastSeaShot;clearTimeout(effectTimer);effectTimer=setTimeout(()=>{effect=null;draw();},effect.result==='sunk'?1900:1100);
    }
    key=nextKey;state=next;options=opts;
    if(drag&&!editable())cancelDrag(false);
    if(!drag)draw();
  }};
}
