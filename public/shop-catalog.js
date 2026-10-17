export const CATALOG = Object.freeze([
  {id:'card-classic',type:'card',value:'classic',name:'Карты · Классика',description:'Светлая бумага и традиционные масти.',price:0,symbol:'♠'},
  {id:'card-astral',type:'card',value:'astral',name:'Карты · Атлас звёзд',description:'Орбиты, созвездия и серебряные звёзды на индиго.',price:500,symbol:'✧'},
  {id:'card-imperial',type:'card',value:'imperial',name:'Карты · Золотой двор',description:'Геометрическая корона и золотая гравировка на чёрном лаке.',price:550,symbol:'♛'},
  {id:'card-koi',type:'card',value:'koi',name:'Карты · Сад кои',description:'Два карпа, волны и медные линии на глубоком бирюзовом фоне.',price:600,symbol:'❧'},
  {"id":"skin-marble","type":"skin","value":"marble","name":"Каррарский мрамор","description":"Молочный и графитовый камень с тонкими золотыми прожилками.","price":160,"symbol":"◈"},
  {"id":"skin-walnut","type":"skin","value":"walnut","name":"Ореховый кап","description":"Продольные волокна, древесные кольца и полированный обод.","price":140,"symbol":"◈"},
  {"id":"skin-damascus","type":"skin","value":"damascus","name":"Дамасская сталь","description":"Волнистые слои кованого металла и чеканный кант.","price":220,"symbol":"◈"},
  {"id":"skin-porcelain","type":"skin","value":"porcelain","name":"Кобальтовый фарфор","description":"Глазурь, синие лепестки и тонкая цветочная роспись.","price":200,"symbol":"◈"},
  {"id":"skin-obsidian","type":"skin","value":"obsidian","name":"Золотой разлом","description":"Гранёный камень с сетью золотых трещин.","price":280,"symbol":"◈"},
  {"id":"skin-cosmic","type":"skin","value":"cosmic","name":"Звёздный опал","description":"Перламутровые слои, созвездия и россыпь звёзд.","price":340,"symbol":"◈"},
  {"id":"cue-bamboo","type":"cue","value":"bamboo","name":"Кий · Бамбук","description":"Узловатый ствол, резная рукоять и обмотка из ротанга.","price":180,"symbol":"╱"},
  {"id":"cue-sabre","type":"cue","value":"sabre","name":"Кий · Сабля","description":"Широкий гранёный корпус с серебряными рёбрами.","price":240,"symbol":"╱"},
  {"id":"cue-dragon","type":"cue","value":"dragon","name":"Кий · Дракон","description":"Резные гребни, чешуя и тлеющие искры вдоль кия.","price":480,"symbol":"╱"},
  {"id":"cue-plasma","type":"cue","value":"plasma","name":"Кий · Плазма","description":"Раздвоенная рукоять и бегущие импульсы в энергетическом канале.","price":600,"symbol":"╱"},
  {"id":"cue-aurora","type":"cue","value":"aurora","name":"Кий · Северное сияние","description":"Кристальные грани и переливающаяся лента полярного света.","price":750,"symbol":"╱"},
  { id: 'ship-classic', type: 'ship', value: 'classic', name: 'Флот · Эскадра', description: 'Броневые корпуса, башни и палубные орудия.', price: 0, symbol: '⚓' },
  { id: 'ship-submarine', type: 'ship', value: 'submarine', name: 'Флот · Подлодки', description: 'Обтекаемый корпус, рубка, перископ и хвостовые рули.', price: 80, symbol: '⚓' },
  { id: 'ship-carrier', type: 'ship', value: 'carrier', name: 'Флот · Авианосцы', description: 'Широкая полётная палуба с самолётами и посадочной полосой.', price: 150, symbol: '⚓' },
  { id: 'ship-viking', type: 'ship', value: 'viking', name: 'Флот · Драккары', description: 'Деревянные ладьи с парусами, щитами и рядами вёсел.', price: 100, symbol: '⚓' },
  { id: 'ship-stealth', type: 'ship', value: 'stealth', name: 'Флот · Стелс', description: 'Угловатые корпуса, гранёные рубки и ракетные шахты.', price: 180, symbol: '⚓' },
  { id: 'cue-classic', type: 'cue', value: 'classic', name: 'Кий · Классика', description: 'Клён, тёмная рукоять и латунные кольца.', price: 0, symbol: '╱' },
  { id: 'cue-carbon', type: 'cue', value: 'carbon', name: 'Кий · Карбон', description: 'Графит и холодные голубые акценты.', price: 80, symbol: '╱' },
  { id: 'cue-emerald', type: 'cue', value: 'emerald', name: 'Кий · Изумруд', description: 'Зелёный лак и золотые вставки.', price: 100, symbol: '╱' },
  { id: 'cue-royal', type: 'cue', value: 'royal', name: 'Кий · Аметист', description: 'Фиолетовое дерево с золотой инкрустацией.', price: 120, symbol: '╱' },
  { id: 'cue-ember', type: 'cue', value: 'ember', name: 'Кий · Жар', description: 'Медный блеск и тёплая янтарная рукоять.', price: 100, symbol: '╱' },
  { id: 'cue-neon', type: 'cue', value: 'neon', name: 'Кий · Неон', description: 'Бирюзовый корпус с розовыми кольцами.', price: 150, symbol: '╱' },
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
export const saleValue = item => item?.price > 0 ? Math.floor(item.price / 2) : 0;
export const validSkin = value => CATALOG.some(item => item.type === 'skin' && item.value === value) ? value : 'classic';
export const validShipSkin = value => CATALOG.some(item => item.type === 'ship' && item.value === value) ? value : 'classic';
export const validEffect = value => CATALOG.some(item => item.type === 'effect' && item.value === value) ? value : 'none';
export function matchCoins(result, moves) {
  return Number.isInteger(moves) && moves >= 4 ? ({ win: 30, draw: 15, loss: 10 }[result] || 0) : 0;
}
export const SKIN_COLORS = Object.freeze({
  marble: {"white":["#fffdf0","#d9d7ce","#99855e"],"black":["#59616b","#242833","#e4c98c"]},
  walnut: {"white":["#f4dbac","#bf8d54","#785132"],"black":["#916240","#39271f","#d9ac73"]},
  damascus: {"white":["#eef2f3","#aab5bd","#66737e"],"black":["#65717f","#252e3b","#b7c9d6"]},
  porcelain: {"white":["#fffff8","#d2dbe8","#355b9a"],"black":["#4669a0","#162b58","#e4ecff"]},
  obsidian: {"white":["#f3e7d0","#beb29a","#a57730"],"black":["#494451","#16151e","#edc264"]},
  cosmic: {"white":["#f9ecff","#bebbe0","#75649c"],"black":["#62548f","#24203f","#c5bbff"]},
  fox: { white: ['#fff4de', '#e4cdb5', '#7b4b37'], black: ['#555165', '#24212f', '#ecd59b'] },
  compass: { white: ['#f7f1d9', '#cec7ae', '#385a6a'], black: ['#3f5360', '#152b39', '#ecd59b'] },
  jade: { white: ['#f5ffe4', '#accb8e', '#71935d'], black: ['#66ab90', '#154737', '#94d4b4'] },
  ice: { white: ['#f4fdff', '#a1d6e9', '#5792bb'], black: ['#538cba', '#193850', '#91d8f3'] },
  amber: { white: ['#fff0b4', '#dba346', '#946426'], black: ['#b67e35', '#4e2f16', '#e7b85f'] },
  neon: { white: ['#ffe9f6', '#db87bd', '#ffb8e4'], black: ['#426579', '#192c38', '#78ede1'] }
});
