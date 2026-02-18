exports.normalizePhone = (input) => {
  if (!input) return null;

  const phone = String(input)
    .replace(/\D/g, '')
    .replace(/^0/, '');

  return phone.length >= 8 ? phone : null;
};
