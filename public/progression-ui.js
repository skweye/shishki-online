import { progression, caseById, milestoneCase } from './cases.js';
import { t } from './i18n.js';

// The level itself is the reward entry point; no separate experience panel.
export function renderProgress(root, state, onReward) {
  if (!root) return;
  const p = state?.progression || progression();
  const count = Object.values(state?.cases || {}).reduce((sum, value) => sum + value, 0);
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const button = el('button', '', 'profile-level-button');
  button.id = 'hero-level'; button.type = 'button'; button.disabled = !count;
  button.dataset.reward = String(count > 0);
  button.setAttribute('aria-haspopup', 'dialog');
  const heading = el('span', '', 'level-heading');
  heading.append(el('span', t('Уровень')), el('strong', String(p.level)));
  if (count) {
    const gift = el('span', '', 'level-gift'); gift.setAttribute('aria-hidden', 'true');
    gift.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 11v10h16V11M3 7h18v4H3zM12 7v14M12 7C5 8 4 2 8 2c3 0 4 5 4 5Zm0 0c7 1 8-5 4-5-3 0-4 5-4 5Z"/></svg>';
    heading.append(gift);
  }
  const progress = el('progress', ''); progress.max = p.required; progress.value = p.current;
  progress.setAttribute('aria-label', t('Опыт до следующего уровня'));
  const label = el('span', p.current + ' / ' + p.required + ' XP', 'level-xp');
  const reward = el('span', count ? t('Забрать награду') + ' · ' + count : t('Кейс на уровне') + ' ' + p.nextCaseLevel, 'level-reward');
  button.title = count ? t('Наградные кейсы') + ': ' + count : t('Следующий кейс') + ': ' + t(caseById(milestoneCase(p.nextCaseLevel)).name);
  button.setAttribute('aria-label', t('Уровень') + ' ' + p.level + '. ' + label.textContent + '. ' + reward.textContent);
  button.onclick = () => { if (count) onReward?.(); };
  button.append(heading, progress, label, reward);
  root.replaceChildren(button);
}
