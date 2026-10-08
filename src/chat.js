export function chatMessage(data, role, name, now) {
  if (typeof data.text !== 'string') throw new Error('Введите сообщение.');
  const text = data.text.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
  if (!text || text.length > 400) throw new Error('Сообщение должно содержать от 1 до 400 символов.');
  return { id: crypto.randomUUID(), side: role, name: name || null, text, sentAt: now };
}
