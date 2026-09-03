// Проверка заявки от человека. Парсеру доверия больше — его данные только нормализуются.

import { CITIES, DEAL_TYPES, districtsOf, normalizeListing } from './schema.js';

const LIMITS = {
  description: 4000,
  address: 200,
  floor: 40,
  features: 20,
  photos: 10,
  priceYear: 100_000_000,
  area: 10_000,
  rooms: 50,
};

export function validateSubmission(payload) {
  const errors = [];
  const raw = payload && typeof payload === 'object' ? payload : {};

  if (!DEAL_TYPES.some((d) => d.id === raw.dealType)) errors.push('dealType');
  if (!CITIES.some((c) => c.id === raw.city)) errors.push('city');
  if (raw.district && !districtsOf(raw.city).some((d) => d.id === raw.district)) {
    errors.push('district');
  }

  const price = Number(raw.priceYear);
  if (!Number.isFinite(price) || price <= 0 || price > LIMITS.priceYear) errors.push('priceYear');

  const hasTelegram = typeof raw.contact?.telegram === 'string' && raw.contact.telegram.trim();
  const hasPhone = typeof raw.contact?.phone === 'string' && raw.contact.phone.trim();
  // Объявление, по которому нельзя связаться, бесполезно всем.
  if (!hasTelegram && !hasPhone) errors.push('contact');

  if (typeof raw.description === 'string' && raw.description.length > LIMITS.description) {
    errors.push('description');
  }
  if (typeof raw.address === 'string' && raw.address.length > LIMITS.address) errors.push('address');
  if (Array.isArray(raw.photos) && raw.photos.length > LIMITS.photos) errors.push('photos');
  if (Array.isArray(raw.features) && raw.features.length > LIMITS.features) errors.push('features');

  const area = Number(raw.area) || 0;
  if (area < 0 || area > LIMITS.area) errors.push('area');
  const rooms = Number(raw.rooms) || 0;
  if (rooms < 0 || rooms > LIMITS.rooms) errors.push('rooms');

  if (errors.length > 0) return { ok: false, errors };

  const item = normalizeListing(raw);
  // Эти поля назначает сервер: заявка не может объявить себя проверенной,
  // подделать источник или задать себе срок жизни.
  item.verified = false;
  item.source = { chat: '', url: '' };
  item.floor = item.floor.slice(0, LIMITS.floor);

  return { ok: true, item };
}
