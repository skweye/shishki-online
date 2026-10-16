import { progression, caseById, milestoneCase } from './cases.js';
import { t } from './i18n.js';
export function renderProgress(root,state){
  const p=state?.progression||progression(),cases=Object.values(state?.cases||{}).reduce((a,b)=>a+b,0);
  root.replaceChildren();
  const title=document.createElement('h2');title.textContent=`${t('Уровень')} ${p.level}`;
  const progress=document.createElement('progress');progress.max=p.required;progress.value=p.current;progress.setAttribute('aria-label',t('Опыт до следующего уровня'));
  const label=document.createElement('p');label.textContent=`${p.current} / ${p.required} XP · ${t('Всего опыта')}: ${p.xp}`;
  const reward=document.createElement('p');reward.textContent=`${t('Следующий кейс')}: ${t(caseById(milestoneCase(p.nextCaseLevel)).name)} · ${t('Уровень')} ${p.nextCaseLevel}`;
  const link=document.createElement('a');link.href='/shop';link.textContent=`${t('Наградные кейсы')}: ${cases} ↗`;
  const rules=document.createElement('small');rules.textContent=t('Опыт: победа +100, ничья +60, поражение +40. От 4 ходов в завершённой онлайн-партии. Каждые 10 уровней — кейс; каждые 50 — королевский.');
  root.append(title,progress,label,reward,link,rules);
}
