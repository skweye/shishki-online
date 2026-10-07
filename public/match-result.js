export function matchResult(game, role = null) {
  if (!game.winner) return null;
  const draw = game.winner === 'draw';
  const victory = !draw && (!role || game.winner === role);
  const winner = game.winner === 'white' ? 'Белые' : 'Чёрные';
  const loser = game.winner === 'white' ? 'Чёрные' : 'Белые';
  const reasons = {
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
