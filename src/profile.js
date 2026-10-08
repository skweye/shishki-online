export function validateProfile(data) {
  if (typeof data.name !== 'string') throw new Error('Введите никнейм от 2 до 40 символов.');
  const name = data.name.trim();
  if (name.length < 2 || name.length > 40 || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw new Error('Введите никнейм от 2 до 40 символов без специальных знаков.');
  const avatar = data.avatar ?? null;
  if (avatar !== null) {
    if (typeof avatar !== 'string' || avatar.length > 100000) throw new Error('Аватар слишком большой. Выберите другое изображение.');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(avatar);
    if (!match) throw new Error('Используйте изображение PNG, JPEG или WebP.');
    let bytes;
    try { bytes = atob(match[2]); } catch { throw new Error('Не удалось прочитать изображение.'); }
    const valid = match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    if (!valid) throw new Error('Не удалось прочитать изображение.');
  }
  return { name, avatar };
}
