import { SUITS, RANKS, rank, suit } from './durak.js';
export const CARD_SKINS = ['classic', 'astral', 'imperial', 'koi'];
export const validCardSkin = value => CARD_SKINS.includes(value) ? value : 'classic';
const ornaments = {
  classic: '<path d="M12 18H88V122H12Z M20 26H80V114H20Z"/><path d="M50 38L71 70 50 102 29 70Z"/>',
  astral: '<circle cx="50" cy="70" r="27"/><ellipse cx="50" cy="70" rx="13" ry="42" transform="rotate(35 50 70)"/><path d="M14 26L36 40 59 19 83 44M18 108L43 121 76 105M50 47L55 64 73 70 55 76 50 93 45 76 27 70 45 64Z"/><g fill="currentColor"><circle cx="14" cy="26" r="2"/><circle cx="59" cy="19" r="2"/><circle cx="83" cy="44" r="2"/><circle cx="43" cy="121" r="2"/></g>',
  imperial: '<path d="M50 12L88 44V96L50 128 12 96V44Z M50 23L78 49V91L50 117 22 91V49Z"/><path d="M31 62L34 85H66L69 62 58 72 50 52 42 72Z M34 91H66 M42 35L50 42 58 35M42 105L50 98 58 105"/><circle cx="50" cy="80" r="3"/>',
  koi: '<path d="M51 24C12 33 17 82 50 87 33 75 34 53 53 48L64 57 61 38 72 30 51 24Z M49 116C88 107 83 58 50 53 67 65 66 87 47 92L36 83 39 102 28 110 49 116Z"/><circle cx="44" cy="37" r="2"/><circle cx="56" cy="103" r="2"/><path d="M13 100Q24 91 35 100M66 40Q77 49 88 40M15 16Q50 7 85 16M15 124Q50 133 85 124"/>',
};
export function cardArt(id = null, skin = 'classic') {
  skin = validCardSkin(skin);
  const back = id === null, symbol = back ? '' : SUITS[suit(id)], label = back ? '' : RANKS[rank(id)];
  return `<svg class="playing-card-art card-skin-${skin} ${back ? 'card-back' : suit(id) === 1 || suit(id) === 2 ? 'card-red' : 'card-black'}" viewBox="0 0 100 140" aria-hidden="true" focusable="false"><rect class="card-paper" x="1.5" y="1.5" width="97" height="137" rx="9"/><rect class="card-border" x="7" y="7" width="86" height="126" rx="5"/>${back ? `<g class="card-ornament">${ornaments[skin]}</g>` : `<g class="card-corner"><text x="12" y="27">${label}</text><text x="13" y="45">${symbol}</text></g><g class="card-corner" transform="rotate(180 50 70)"><text x="12" y="27">${label}</text><text x="13" y="45">${symbol}</text></g><g class="card-face-ornament">${ornaments[skin]}</g><text class="card-suit" x="50" y="84" text-anchor="middle">${symbol}</text>`}</svg>`;
}
export const cardPreview = skin => `<div class="card-preview"><span>${cardArt(null, skin)}</span><span>${cardArt(26, skin)}</span><span>${cardArt(34, skin)}</span></div>`;
