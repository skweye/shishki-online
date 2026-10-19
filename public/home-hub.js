import { t } from './i18n.js';

export function createHomeHub() {
  const $ = id => document.getElementById(id);
  let version = 0, lastUser = null, controller;
  $('hub-login').onclick = () => $('menu-login').click();
  document.addEventListener('presencechange', ({detail}) => {
    $('home-online').textContent = detail ? detail.online.toLocaleString() : '—';
    $('home-searching').textContent = detail ? detail.searching.toLocaleString() : '—';
    $('home-presence-note').textContent = t(detail ? 'Активные игроки за последнюю минуту. Гости тоже учитываются.' : 'Счётчик временно недоступен. Играть можно как обычно.');
  });
  async function update(user) {
    lastUser = user; const ticket = ++version; controller?.abort(); controller = new AbortController();
    $('hub-name').textContent = user?.name || t('Гость');
    $('hub-avatar').replaceChildren();
    if(user?.avatar){const image=document.createElement('img');image.src=user.avatar;image.alt='';$('hub-avatar').append(image);}
    else $('hub-avatar').textContent = user?.name?.slice(0,1).toUpperCase() || '◉';
    $('hub-login').hidden = !!user;
    for(const id of ['hub-level','hub-stats','hub-stats-note'])$(id).hidden = !user;
    $('hub-account-hint').textContent = t(user ? 'Ваш прогресс и награды — в профиле.' : 'Играйте без регистрации или войдите, чтобы сохранять прогресс.');
    $('hub-level-value').textContent = user ? String(user.level || 1) : '';
    $('hub-xp').value = 0; $('hub-xp').max = 1;
    for(const id of ['hub-played','hub-wins','hub-coins'])$(id).textContent='—';
    if(!user)return;
    const active=controller,timeout=setTimeout(()=>active.abort(),15000),signal=active.signal;
    async function request(path){const response=await fetch('/api/auth/'+path,{signal});if(!response.ok)throw Error('account');return response.json();}
    const results=await Promise.allSettled([request('account'),request('shop')]);clearTimeout(timeout);
    if(ticket!==version)return;
    const [account,shop]=results;
    if(account.status==='fulfilled' && Array.isArray(account.value.modes)){
      const total=account.value.modes.reduce((sum,row)=>({played:sum.played+Number(row.played),wins:sum.wins+Number(row.wins)}),{played:0,wins:0});
      $('hub-played').textContent=total.played.toLocaleString();$('hub-wins').textContent=total.wins.toLocaleString();
    }
    if(shop.status==='fulfilled' && shop.value.progression){
      const {balance,progression:p}=shop.value;
      $('hub-coins').textContent=Number(balance).toLocaleString();$('hub-level-value').textContent=String(p.level);
      $('hub-xp').max=p.required;$('hub-xp').value=p.current;
      $('hub-level').title=`${p.current} / ${p.required} XP`;
      $('hub-level').classList.toggle('has-reward',Object.values(shop.value.cases||{}).some(count=>count>0));
    }
    $('hub-stats-note').textContent=t(results.some(result=>result.status==='rejected')?'Часть данных недоступна. Обновим при возвращении на главную.':'Статистика завершённых онлайн-партий.');
  }
  document.addEventListener('languagechange',()=>{if(!lastUser)$('hub-name').textContent=t('Гость');});
  return {update};
}
