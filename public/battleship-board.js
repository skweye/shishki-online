import { FLEET, shipCells, canPlaceShip, randomFleet, battleshipView, seaCoordinate } from './battleship.js';
import { t } from './i18n.js';
export function createBattleshipBoard(action){
  const root=document.getElementById('battleship-board');let state,options,draft=[],vertical=false,unlocked=null,key=null,error='';
  const opposite=side=>side==='white'?'black':'white';
  const button=(label,command,disabled=false)=>`<button type="button" class="secondary-button" data-sea-action="${command}" ${disabled?'disabled':''}>${t(label)}</button>`;
  function grid(side,own,view,enabled,setup){
    const ships=(setup?draft:view.fleets[side]).flat(),shots=view.shots[opposite(side)],sunk=shots.flatMap(shot=>shot.sunkCells||[]);
    let html='<div class="sea-grid"><span></span>'+'ABCDEFGHIJ'.split('').map(letter=>`<span class="sea-axis">${letter}</span>`).join('');
    for(let row=0;row<10;row++){
      html+=`<span class="sea-axis">${row+1}</span>`;
      for(let col=0;col<10;col++){
        const cell=row*10+col,shot=shots.find(shot=>shot.cell===cell),ship=ships.includes(cell);
        const status=sunk.includes(cell)?'sunk':shot?shot.result:ship?'ship':'water';
        const label=t({sunk:'Потоплен',hit:'Попадание',miss:'Мимо',ship:'Корабль',water:'Вода'}[status]);
        const interactive=enabled&&(setup?draft.length<10:!own&&!shot);
        html+=`<button type="button" class="sea-cell sea-${status}" data-sea-cell="${cell}" data-sea-own="${own}" aria-label="${seaCoordinate(cell)}: ${label}" ${interactive?'':'disabled'}>${status==='hit'||status==='sunk'?'×':status==='miss'?'·':ship?'▪':''}</button>`;
      }
    }
    return html+'</div>';
  }
  function draw(){
    if(!state)return;
    const side=options.mode==='local'?state.turn:options.role||'white';
    if(options.mode==='local'&&!state.winner&&unlocked!==key){
      root.innerHTML=`<div class="sea-curtain"><span aria-hidden="true">⚓</span><h3>${t(side==='white'?'Передайте устройство белым':'Передайте устройство чёрным')}</h3><p>${t('Откройте поле, когда соперник отвернётся.')}</p>${button('Открыть моё поле','reveal')}</div>`;return;
    }
    const view=battleshipView(state,side),setup=state.phase==='setup',editing=setup&&!state.ready[side]&&state.turn===side,enabled=options.enabled;
    const hits=state.shots[side].filter(shot=>shot.result!=='miss').length;
    let html=`<div class="sea-heading"><span aria-hidden="true">⚓</span><div><h3>${t(setup?'Расстановка флота':'Морской бой')}</h3><p>${t(setup?'Корабли не касаются даже углами.':'Попадание даёт ещё один выстрел.')}</p></div><strong>${setup?draft.length+' / 10':hits+' / 20'}</strong></div>`;
    if(editing)html+=`<div class="sea-tools">${button('Расставить случайно','random',!enabled)}${button(vertical?'Вертикально ↕':'Горизонтально ↔','rotate',!enabled)}${button('Убрать последний','undo',!enabled||!draft.length)}${button('Очистить поле','clear',!enabled||!draft.length)}</div><p class="sea-instruction">${t(draft.length<10?'Выберите начало корабля. Следующий корабль:':'Флот расставлен. Подтвердите готовность.')}${draft.length<10?' '+FLEET[draft.length]+' ■':''}</p>`;
    else if(setup)html+=`<p class="sea-instruction">${t('Соперник расставляет корабли. Ваш флот скрыт от него.')}</p>`;
    html+=`<p class="sea-error" role="alert">${t(error)}</p><div class="sea-fields"><section><h4>${t('Ваш флот')}</h4>${grid(side,true,view,enabled&&editing,editing)}</section>`;
    if(!setup)html+=`<section><h4>${t('Поле соперника')}</h4>${grid(opposite(side),false,view,enabled,false)}</section>`;
    html+='</div>';
    if(editing)html+=`<button type="button" class="primary-button sea-ready" data-sea-action="ready" ${enabled&&draft.length===10?'':'disabled'}>${t('Флот готов — в бой')}</button>`;
    const last=state.lastSeaShot;
    if(!setup)html+=`<p class="sea-result" role="status">${last?seaCoordinate(last.cell)+' · '+t({miss:'Мимо',hit:'Попадание',sunk:'Потоплен'}[last.result]):t('Выберите клетку на поле соперника.')}</p>`;
    if(options.mode==='local'&&!state.winner)html+=button('Скрыть моё поле','hide');
    root.innerHTML=html;
  }
  root.addEventListener('click',event=>{
    const target=event.target.closest('button');if(!target||target.disabled)return;
    const command=target.dataset.seaAction;
    if(command==='reveal'){unlocked=key;draw();return;}
    if(command==='hide'){unlocked=null;draw();return;}
    if(!options.enabled)return;
    error='';
    if(command==='random')draft=randomFleet();
    else if(command==='rotate')vertical=!vertical;
    else if(command==='undo')draft.pop();
    else if(command==='clear')draft=[];
    else if(command==='ready'){action({type:'fleet-ready',fleet:draft});return;}
    else if(target.dataset.seaCell!==undefined){
      const cell=Number(target.dataset.seaCell);
      if(state.phase==='setup'){
        const ship=shipCells(cell,FLEET[draft.length],vertical);
        if(ship.length===FLEET[draft.length]&&canPlaceShip(draft,ship))draft.push(ship);
        else error='Здесь корабль не помещается или касается другого.';
      }else if(target.dataset.seaOwn==='false'){action({type:'sea-fire',cell});return;}
    }
    draw();
  });
  function hide(){unlocked=null;if(state)draw();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&options?.mode==='local')hide();});
  window.addEventListener('blur',()=>{if(options?.mode==='local')hide();});
  document.addEventListener('languagechange',draw);
  return {hide,render(next,opts){
    const nextKey=opts.mode+':'+(opts.role||next.turn)+':'+next.turn+':'+next.phase;
    if(nextKey!==key||next.revision<state?.revision||next.phase==='setup'&&state?.winner){unlocked=null;draft=[];error='';}
    key=nextKey;state=next;options=opts;draw();
  }};
}
