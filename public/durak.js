export const DURAK_VARIANTS = ['durak-simple', 'durak-throw', 'durak-transfer'];
export const isDurak = variant => DURAK_VARIANTS.includes(variant);
export const SUITS = ['♣', '♦', '♥', '♠'];
export const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const rank = id => id % 9;
export const suit = id => Math.floor(id / 9);
export const cardName = id => RANKS[rank(id)] + SUITS[suit(id)];
const other = side => side === 'white' ? 'black' : 'white';
export function shuffleCards() {
  const deck = Array.from({ length: 36 }, (_, i) => i), sample = new Uint32Array(1);
  for (let i = 35; i > 0; i--) {
    const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
    do { crypto.getRandomValues(sample); } while (sample[0] >= limit);
    const j = sample[0] % (i + 1); [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
export function newDurak(variant = 'durak-throw', deck = shuffleCards()) {
  if (!isDurak(variant) || !Array.isArray(deck) || deck.length !== 36 || new Set(deck).size !== 36 || deck.some(id => !Number.isInteger(id) || id < 0 || id > 35)) throw Error('Некорректная колода.');
  const hands = { white: deck.slice(0, 6), black: deck.slice(6, 12) }, stock = deck.slice(12), trump = stock.at(-1);
  const lowest = side => Math.min(...hands[side].filter(id => suit(id) === suit(trump)).map(rank));
  const attacker = lowest('black') < lowest('white') ? 'black' : 'white';
  return { variant, dealId: crypto.randomUUID(), board: Array(36).fill(0), hands, stock, trump, attacker, defender: other(attacker), turn: attacker,
    table: [], discard: [], limit: variant === 'durak-simple' ? 1 : 6, taking: false, bout: 1,
    forced: null, captured: [], path: [], repetitions: {}, history: [], revision: 0, winner: null, reason: null };
}
export function beats(card, attack, trump) {
  return suit(card) === suit(attack) ? rank(card) > rank(attack) : suit(card) === suit(trump) && suit(attack) !== suit(trump);
}
export function durakActions(state, side = state.turn) {
  if (!isDurak(state.variant) || state.winner || side !== state.turn) return [];
  const hand = state.hands[side] || [], table = state.table, actions = [];
  if (side === state.defender && !state.taking) {
    for (let target = 0; target < table.length; target++) if (table[target].defend === null)
      for (const card of hand) if (beats(card, table[target].attack, state.trump)) actions.push({ type: 'durak-defend', card, target });
    if (table.some(pair => pair.defend === null)) actions.push({ type: 'durak-take' });
    const targetCount = state.handCounts?.[state.attacker] ?? state.hands[state.attacker].length;
    if (state.variant === 'durak-transfer' && table.length && table.every(pair => pair.defend === null) && table.length < Math.min(6, targetCount)) {
      for (const card of hand) if (table.every(pair => rank(pair.attack) === rank(card))) actions.push({ type: 'durak-transfer', card });
    }
  } else if (side === state.attacker) {
    const ranks = table.flatMap(pair => [rank(pair.attack), ...(pair.defend === null ? [] : [rank(pair.defend)])]);
    if (table.length < state.limit) for (const card of hand) if (!table.length || ranks.includes(rank(card))) actions.push({ type: 'durak-attack', card });
    if (table.length && (state.taking || table.every(pair => pair.defend !== null))) actions.push({ type: 'durak-finish' });
  }
  return actions;
}
function finishBout(state) {
  const cards = state.table.flatMap(pair => [pair.attack, ...(pair.defend === null ? [] : [pair.defend])]);
  if (state.taking) state.hands[state.defender].push(...cards); else state.discard.push(...cards);
  for (const side of [state.attacker, state.defender]) while (state.hands[side].length < 6 && state.stock.length) state.hands[side].push(state.stock.shift());
  const nextAttacker = state.taking ? state.attacker : state.defender;
  state.table = []; state.taking = false; state.bout++;
  state.attacker = nextAttacker; state.defender = other(nextAttacker); state.turn = nextAttacker;
  state.limit = Math.min(state.variant === 'durak-simple' ? 1 : 6, state.hands[state.defender].length);
  if (!state.stock.length) {
    const white = !state.hands.white.length, black = !state.hands.black.length;
    if (white || black) { state.winner = white && black ? 'draw' : white ? 'white' : 'black'; state.reason = 'durak-empty'; }
  }
}
export function actDurak(state, side, action) {
  if (!durakActions(state, side).some(legal => legal.type === action.type && legal.card === action.card && legal.target === action.target)) throw Error('Этот ход в Дураке недоступен.');
  const next = structuredClone(state), type = action.type, card = action.card;
  if (Number.isInteger(card)) next.hands[side].splice(next.hands[side].indexOf(card), 1);
  if (type === 'durak-attack') {
    next.table.push({ attack: card, attackSide: side, defend: null });
    if (!next.taking) next.turn = next.defender;
  } else if (type === 'durak-defend') {
    next.table[action.target].defend = card; next.table[action.target].defendSide = side;
    if (next.table.every(pair => pair.defend !== null)) next.turn = next.attacker;
  } else if (type === 'durak-transfer') {
    next.table.push({ attack: card, attackSide: side, defend: null });
    [next.attacker, next.defender] = [next.defender, next.attacker];
    next.limit = Math.min(6, next.hands[next.defender].length); next.turn = next.defender;
  } else if (type === 'durak-take') {
    next.taking = true; next.turn = next.attacker;
    if (next.variant === 'durak-simple') finishBout(next);
  } else if (type === 'durak-finish') finishBout(next);
  next.revision++;
  next.lastAction = { type, side, card: card ?? null, revision: next.revision };
  const label = ({ 'durak-attack': '↗', 'durak-defend': '✓', 'durak-transfer': '⇄', 'durak-take': '↓', 'durak-finish': '▪' })[type];
  next.history.push({ side, round: state.bout, from: 0, to: 0, capture: null, notation: label + (card === undefined ? '' : ' ' + cardName(card)) });
  return next;
}
// Never expose the draw pile or another player's hand, including error/sync responses.
export function durakView(state, role) {
  if (!isDurak(state.variant)) return state;
  const view = structuredClone(state);
  view.handCounts = { white: state.hands.white.length, black: state.hands.black.length }; view.stockCount = state.stock.length;
  view.hands = { white: role === 'white' ? view.hands.white : [], black: role === 'black' ? view.hands.black : [] };
  delete view.stock; return view;
}
export function validateDurakSave(state) {
  const cards = [...state.hands.white, ...state.hands.black, ...state.stock, ...state.discard,
    ...state.table.flatMap(pair => [pair.attack, ...(pair.defend === null ? [] : [pair.defend])])];
  if (cards.length !== 36 || new Set(cards).size !== 36 || cards.some(id => !Number.isInteger(id) || id < 0 || id > 35) || !['white', 'black'].includes(state.attacker) || state.defender !== other(state.attacker) || !Number.isInteger(state.trump) || state.trump < 0 || state.trump > 35 || !Number.isInteger(state.limit) || state.limit < 0 || state.limit > 6) throw Error('Некорректная колода.');
}
