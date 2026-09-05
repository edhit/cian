import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, TriangleAlert } from 'lucide-react';
import { Sheet } from './Sheet.jsx';
import { Segmented } from './Chips.jsx';
import { Field, NumberInput, PickMany, PickOne, TextArea, TextInput, Toggle } from './Form.jsx';
import { PhotoPicker } from './PhotoPicker.jsx';
import { submitListing } from '../lib/api.js';
import {
  activeCities,
  DEAL_TYPES,
  FEATURE_LABELS,
  districtsOf,
  validateSubmission,
} from '../lib/schema.js';
import { getUser, haptic, isTelegram, openLink } from '../lib/telegram.js';

const FEATURE_OPTIONS = Object.entries(FEATURE_LABELS).map(([id, label]) => ({ id, label }));
const BOT_URL = (import.meta.env.VITE_BOT_URL || '').trim();

function emptyDraft(city) {
  return {
    dealType: 'rent',
    city,
    district: '',
    address: '',
    priceYear: 0,
    deposit: 0,
    commission: 0,
    utilities: 0,
    rooms: 0,
    area: 0,
    floor: '',
    furnished: false,
    features: [],
    description: '',
    photos: [],
    contact: { telegram: '', phone: '' },
  };
}

const REASONS = {
  unauthorized: 'Telegram не подтвердил, кто вы. Откройте приложение заново.',
  'too-many': 'Слишком много заявок за час. Попробуйте позже.',
  network: 'Не получилось связаться с сервером. Проверьте соединение.',
  server: 'Сервер не принял заявку. Попробуйте позже.',
  'no-backend': 'Приём заявок пока не подключён.',
  invalid: 'Проверьте отмеченные поля.',
};

/** Заявка на публикацию. Отправлять её может только тот, кого подтвердил Telegram. */
export function SubmitSheet({ open, onClose, city, onSubmitted, onOpenMine }) {
  const user = getUser();
  const [draft, setDraft] = useState(() => emptyDraft(city));
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    const fresh = emptyDraft(city);
    // Подставляем то, что и так знаем: человеку незачем набирать свой ник.
    if (user && user.username) fresh.contact.telegram = user.username;
    setDraft(fresh);
    setTouched(false);
    setResult(null);
    setSending(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, city]);

  const patch = (fields) => setDraft((prev) => ({ ...prev, ...fields }));
  const isSale = draft.dealType === 'sale';

  // Те же правила, что на Worker: schema.js общий, расхождения быть не может.
  const check = useMemo(() => validateSubmission(draft), [draft]);
  const invalid = new Set(
    result && result.reason === 'invalid' ? result.fields : touched ? check.errors || [] : [],
  );

  const districts = useMemo(
    () => [{ id: '', label: 'Не указан' }, ...districtsOf(draft.city)],
    [draft.city],
  );

  const send = async () => {
    setTouched(true);
    if (!check.ok) {
      haptic('error');
      setResult({ ok: false, reason: 'invalid', fields: check.errors });
      return;
    }

    setSending(true);
    const response = await submitListing(draft);
    setSending(false);
    setResult(response);

    if (response.ok) {
      haptic('success');
      onSubmitted();
    } else {
      haptic('error');
    }
  };

  // Заявку невозможно подписать вне Telegram — форму в браузере не показываем,
  // вместо того чтобы дать заполнить её и упереться в отказ.
  if (!isTelegram) {
    return (
      <Sheet open={open} onClose={onClose} title="Разместить объявление">
        <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
          <TriangleAlert size={28} className="text-label-3" strokeWidth={1.5} />
          <p className="text-body text-label">Только из Telegram</p>
          <p className="text-caption text-label-2">
            Объявление подписывается вашим аккаунтом Telegram — иначе мы не знаем, чья это
            заявка и с кем связываться. Откройте приложение в Telegram.
          </p>
          {BOT_URL ? (
            <button
              type="button"
              onClick={() => openLink(BOT_URL)}
              className="mt-2 rounded-full bg-fill px-4 py-2 text-[15px] leading-5 text-accent active:opacity-60"
            >
              Открыть в Telegram
            </button>
          ) : null}
        </div>
      </Sheet>
    );
  }

  if (result && result.ok) {
    return (
      <Sheet open={open} onClose={onClose} title="Заявка отправлена">
        <div className="flex flex-col items-center gap-3 px-8 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-accent-2">
            <Check size={26} className="text-accent" strokeWidth={2.5} />
          </span>
          <p className="text-body text-label">Отправлено на проверку</p>
          <p className="text-caption text-label-2">
            Объявление появится в ленте после проверки. Пока оно видно только вам —
            в разделе «Мои объявления».
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMine();
              }}
              className="rounded-full bg-fill px-5 py-2 text-[15px] leading-5 text-accent active:opacity-60"
            >
              Мои объявления
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-fill px-5 py-2 text-[15px] leading-5 text-label active:opacity-60"
            >
              Понятно
            </button>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Разместить объявление"
      full
      footer={
        <div className="space-y-2">
          {result && !result.ok ? (
            <p className="text-center text-caption text-danger">
              {REASONS[result.reason] || REASONS.server}
            </p>
          ) : null}
          <button
            type="button"
            onClick={send}
            disabled={sending}
            className="w-full rounded-[10px] bg-accent py-3 text-body font-medium text-white active:opacity-80 disabled:opacity-50"
          >
            {sending ? 'Отправляем…' : 'Отправить на проверку'}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-4 pb-6">
        <button
          type="button"
          onClick={onOpenMine}
          className="flex w-full items-center gap-2 rounded-[10px] bg-card px-4 py-3 text-left active:bg-fill"
        >
          <span className="flex-1 text-body text-label">Мои объявления</span>
          <ChevronRight size={18} className="shrink-0 text-label-3" />
        </button>

        <div className="overflow-hidden rounded-[10px] bg-card">
          <Field label="Тип сделки">
            <Segmented
              options={DEAL_TYPES}
              value={draft.dealType}
              onChange={(dealType) => patch({ dealType })}
            />
          </Field>

          <Field label="Город" invalid={invalid.has('city')}>
            <PickOne
              options={activeCities()}
              value={draft.city}
              invalid={invalid.has('city')}
              onChange={(nextCity) => patch({ city: nextCity, district: '' })}
            />
          </Field>

          <Field label="Район" invalid={invalid.has('district')}>
            <PickOne
              options={districts}
              value={draft.district}
              onChange={(district) => patch({ district })}
            />
          </Field>

          <Field label="Адрес" hint="улица и дом">
            <TextInput
              value={draft.address}
              maxLength={200}
              placeholder="Например: дом 44"
              invalid={invalid.has('address')}
              onChange={(address) => patch({ address })}
            />
          </Field>
        </div>

        <div className="overflow-hidden rounded-[10px] bg-card">
          <Field
            label={isSale ? 'Цена, SAR' : 'Цена за год, SAR'}
            hint="обязательно"
            invalid={invalid.has('priceYear')}
          >
            <NumberInput
              value={draft.priceYear}
              placeholder="0"
              invalid={invalid.has('priceYear')}
              onChange={(priceYear) => patch({ priceYear })}
            />
          </Field>

          {!isSale ? (
            <>
              <Field label="Залог, SAR" hint="возвращается">
                <NumberInput value={draft.deposit} placeholder="0" onChange={(deposit) => patch({ deposit })} />
              </Field>
              <Field label="Комиссия, SAR" hint="разово">
                <NumberInput
                  value={draft.commission}
                  placeholder="0"
                  onChange={(commission) => patch({ commission })}
                />
              </Field>
              <Field label="Коммунальные, SAR" hint="в месяц">
                <NumberInput
                  value={draft.utilities}
                  placeholder="0"
                  onChange={(utilities) => patch({ utilities })}
                />
              </Field>
            </>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[10px] bg-card">
          <Field label="Комнаты" invalid={invalid.has('rooms')}>
            <NumberInput value={draft.rooms} placeholder="0" onChange={(rooms) => patch({ rooms })} />
          </Field>
          <Field label="Площадь, м²" invalid={invalid.has('area')}>
            <NumberInput value={draft.area} placeholder="0" onChange={(area) => patch({ area })} />
          </Field>
          <Field label="Этаж">
            <TextInput
              value={draft.floor}
              maxLength={40}
              placeholder="Например: 3 из 6"
              onChange={(floor) => patch({ floor })}
            />
          </Field>
          <Field label="Мебель">
            <Toggle value={draft.furnished} onChange={(furnished) => patch({ furnished })} label="Есть мебель" />
          </Field>
          <Field label="Особенности">
            <PickMany
              options={FEATURE_OPTIONS}
              values={draft.features}
              onChange={(features) => patch({ features })}
            />
          </Field>
        </div>

        <div className="overflow-hidden rounded-[10px] bg-card">
          <Field label="Фотографии" invalid={invalid.has('photos')}>
            <PhotoPicker
              urls={draft.photos}
              onChange={(update) =>
                setDraft((prev) => ({
                  ...prev,
                  photos: typeof update === 'function' ? update(prev.photos) : update,
                }))
              }
            />
          </Field>
        </div>

        <div className="overflow-hidden rounded-[10px] bg-card">
          <Field label="Описание" hint={`${draft.description.length} из 4000`}>
            <TextArea
              value={draft.description}
              maxLength={4000}
              placeholder="Что важно знать: район, транспорт, условия договора"
              onChange={(description) => patch({ description })}
            />
          </Field>
        </div>

        <div className="overflow-hidden rounded-[10px] bg-card">
          <Field
            label="Telegram"
            hint="без @"
            invalid={invalid.has('contact')}
          >
            <TextInput
              value={draft.contact.telegram}
              maxLength={64}
              placeholder="username"
              invalid={invalid.has('contact')}
              onChange={(telegram) => patch({ contact: { ...draft.contact, telegram } })}
            />
          </Field>
          <Field label="Телефон" invalid={invalid.has('contact')}>
            <TextInput
              value={draft.contact.phone}
              maxLength={32}
              placeholder="+966…"
              invalid={invalid.has('contact')}
              onChange={(phone) => patch({ contact: { ...draft.contact, phone } })}
            />
          </Field>
          {invalid.has('contact') ? (
            <p className="border-t border-separator px-4 py-2 text-caption text-danger">
              Нужен хотя бы один способ связи — иначе по объявлению нельзя обратиться.
            </p>
          ) : null}
        </div>

        <p className="px-1 text-caption text-label-3">
          Объявление публикуется после проверки.
        </p>
      </div>
    </Sheet>
  );
}
