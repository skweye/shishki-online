import { roundAdvance } from './chapaev.js';
export function matchResult(game, role = null) {
  if (!game.winner) return null;
  const draw = game.winner === 'draw';
  const victory = !draw && (!role || game.winner === role);
  const winner = game.winner === 'white' ? 'Белые' : 'Чёрные';
  const loser = game.winner === 'white' ? 'Чёрные' : 'Белые';
  if (game.reason === 'round') {
    const advance = roundAdvance(game), moved = advance.moved === 'white' ? 'Белые' : 'Чёрные';
    return {
      kind: draw ? 'draw' : victory ? 'victory' : 'defeat',
      title: draw ? `Раунд ${game.round || 1}: ничья` : `${winner} выиграли раунд ${game.round || 1}!`,
      text: draw ? 'Оба ряда восстанавливаются на прежних местах.' : advance.moved === game.winner ? `${moved} продвигаются на одну клетку вперёд. Обе стороны снова получают по восемь шашек.` : `Ряды стоят вплотную. ${moved} отступают на одну клетку. Обе стороны снова получают по восемь шашек.`,
      symbol: draw ? '½' : '↗'
    };
  }
  const reasons = {
    'eight-ball': 'Восьмёрка забита. Партия завершена!',
    'illegal-eight': 'Восьмёрка забита с нарушением. Победа присуждена сопернику ударившего.',
    'bear-off': 'Все 15 фишек выведены с доски. Партия завершена!',
    mars: 'Марс! Все 15 фишек выведены, а соперник ещё не вывел ни одной.',
    timeout: 'Время закончилось. Победа присуждена сопернику.',
    checkmate: 'Мат. Король не может избежать атаки. Партия завершена!',
    stalemate: 'Пат: нет доступных ходов, а король не под шахом. Ничья.',
    material: 'Недостаточно фигур для мата. Партия завершена вничью.',
    'fifty-moves': '50 ходов каждой стороны без взятия и хода пешкой. Ничья.',
    territory: `${loser} больше не могут отступить: край доски. Партия завершена!`,
    knockout: draw ? 'Все шашки покинули доску одновременно.' : `${loser} потеряли все шашки. Отличный раунд!`,
    resign: role ? victory ? 'Соперник сдался. Эта партия за вами.' : 'Вы сдались. Следующая партия — новый шанс.' : `${loser} сдались. Победа за ${game.winner === 'white' ? 'белыми' : 'чёрными'}.`,
    'no-moves': role ? victory ? 'У соперника не осталось доступных ходов.' : 'У вас не осталось доступных ходов. Попробуйте другую стратегию в реванше.' : `${loser} остались без доступных ходов.`,
    repetition: 'Позиция повторилась три раза. Партия завершена вничью.',
    agreement: 'Оба игрока согласились на ничью. Спасибо за партию.'
  };
  return {
    kind: draw ? 'draw' : victory ? 'victory' : 'defeat',
    title: draw ? 'Ничья. Хорошая игра!' : role ? victory ? 'Ваша победа!' : 'В этот раз — поражение' : `${winner} побеждают!`,
    text: reasons[game.reason] || 'Партия завершена. Встретимся за доской ещё раз?',
    symbol: draw ? '½' : victory ? '♛' : '↻'
  };
}
