export const CATALOG = Object.freeze([
  { id: 'skin-classic', type: 'skin', value: 'classic', name: 'Классика', description: 'Тёплое дерево и знакомый рельеф.', price: 0, symbol: '◉' },
  { id: 'skin-fox', type: 'skin', value: 'fox', name: 'Лунный лис', description: 'Гравировка лисы, полумесяц и искры на фарфоре.', price: 100, symbol: '☾' },
  { id: 'skin-compass', type: 'skin', value: 'compass', name: 'Роза ветров', description: 'Восемь лучей компаса на слоновой кости и обсидиане.', price: 120, symbol: '✥' },
  { id: 'skin-jade', type: 'skin', value: 'jade', name: 'Нефрит', description: 'Молочный камень и глубокий зелёный.', price: 60, symbol: '◈' },
  { id: 'skin-ice', type: 'skin', value: 'ice', name: 'Ледник', description: 'Ледяной голубой и ночной синий.', price: 90, symbol: '❄' },
  { id: 'skin-amber', type: 'skin', value: 'amber', name: 'Янтарь', description: 'Медовое золото и тёмная бронза.', price: 120, symbol: '✧' },
  { id: 'skin-neon', type: 'skin', value: 'neon', name: 'Неон', description: 'Светящиеся кольца розового и бирюзового.', price: 150, symbol: '◎' },
  { id: 'effect-none', type: 'effect', value: 'none', name: 'Без эффекта', description: 'Сразу показать результат партии.', price: 0, symbol: '○' },
  { id: 'effect-confetti', type: 'effect', value: 'confetti', name: 'Конфетти', description: 'Шашки победителя подпрыгивают под конфетти.', price: 60, symbol: '✦' },
  { id: 'effect-rocket', type: 'effect', value: 'rocket', name: 'Ракета', description: 'Ударная волна разбрасывает шашки соперника.', price: 100, symbol: '🚀' },
  { id: 'effect-lightning', type: 'effect', value: 'lightning', name: 'Молния', description: 'Шашки вспыхивают и дрожат от разряда.', price: 120, symbol: 'ϟ' },
  { id: 'effect-comet', type: 'effect', value: 'comet', name: 'Комета', description: 'Звёздный след сдвигает шашки на своём пути.', price: 140, symbol: '☄' },
  { id: 'effect-laurel', type: 'effect', value: 'laurel', name: 'Триумф', description: 'Шашки победителя поднимаются в золотом сиянии.', price: 80, symbol: '♛' },
  { id: 'effect-fireworks', type: 'effect', value: 'fireworks', name: 'Фейерверк', description: 'Шашки подпрыгивают в ритме трёх салютов.', price: 130, symbol: '✺' },
  { id: 'effect-portal', type: 'effect', value: 'portal', name: 'Портал', description: 'Шашки соперника закручиваются в портал.', price: 160, symbol: '◎' },
  { id: 'effect-blizzard', type: 'effect', value: 'blizzard', name: 'Метель', description: 'Шашки покрываются инеем и скользят по доске.', price: 110, symbol: '❄' },
  { id: 'effect-petals', type: 'effect', value: 'petals', name: 'Сакура', description: 'Лепестки мягко раскачивают шашки на ветру.', price: 90, symbol: '✿' },
  { id: 'effect-eclipse', type: 'effect', value: 'eclipse', name: 'Затмение', description: 'Тень накрывает соперника, победитель сияет.', price: 180, symbol: '◉' }
]);
export const itemById = id => typeof id === 'string' ? CATALOG.find(item => item.id === id) : undefined;
export const validSkin = value => CATALOG.some(item => item.type === 'skin' && item.value === value) ? value : 'classic';
export const validEffect = value => CATALOG.some(item => item.type === 'effect' && item.value === value) ? value : 'none';
export function matchCoins(result, moves) {
  return Number.isInteger(moves) && moves >= 4 ? ({ win: 30, draw: 15, loss: 10 }[result] || 0) : 0;
}
export const SKIN_COLORS = Object.freeze({
  fox: { white: ['#fff4de', '#e4cdb5', '#7b4b37'], black: ['#555165', '#24212f', '#ecd59b'] },
  compass: { white: ['#f7f1d9', '#cec7ae', '#385a6a'], black: ['#3f5360', '#152b39', '#ecd59b'] },
  jade: { white: ['#f5ffe4', '#accb8e', '#71935d'], black: ['#66ab90', '#154737', '#94d4b4'] },
  ice: { white: ['#f4fdff', '#a1d6e9', '#5792bb'], black: ['#538cba', '#193850', '#91d8f3'] },
  amber: { white: ['#fff0b4', '#dba346', '#946426'], black: ['#b67e35', '#4e2f16', '#e7b85f'] },
  neon: { white: ['#ffe9f6', '#db87bd', '#ffb8e4'], black: ['#426579', '#192c38', '#78ede1'] }
});
