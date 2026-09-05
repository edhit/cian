/* ============================================================
   РЕКЛАМА
   Файл собран в ads-editor.html — можно править и руками.

   type   'card' | 'banner' | 'strip' | 'image'
   color  green blue purple orange red gold teal pink dark или '#0A6CFF'
   until  дата, после которой объявление уходит в архив, 'ГГГГ-ММ-ДД'
   ============================================================ */

/* Действующие объявления — их показывает сайт. */
export const ads = [
  {
    type: 'strip',
    color: 'gold',
    logo: 'data:image/jpeg;base64,/9j/4AAQSkZJR',
    title: 'Валюта КСА — мгновенный перевод',
    text: 'Конвертер для жителей Саудовской Аравии. Быстро. Точно. Бесплатно.',
    url: 'https://arbcurrency.pages.dev/',
  },
  {
    type: 'strip',
    color: '#aaa',
    logo: 'data:image/jpeg;base64,/9j/4AAQSkZJR',
    title: 'Тафсир и Перевод Корана в телеграм',
    text: 'Чтение Корана в исполнении Махмуда Халиль Аль-Хусари',
    url: 'https://t.me/mmmm_hosary_bot',
  },
  {
    type: 'strip',
    color: 'blue',
    logo: 'data:image/jpeg;base64,/9j/4AAQSkZJR',
    title: 'Твое объявление уже здесь',
    text: 'Просто нажми, и ее увидят все',
    url: 'https://t.me/medinah_jamiah',
  },
];

/* Архив: сайт эти объявления НЕ показывает. */
export const archive = [];

/* Показывается, когда действующих объявлений нет. */
export const placeholderAd = {
  type: 'banner',
  color: 'gold',
  title: 'Здесь может быть ваша реклама',
  text: 'Визы, трансфер до границы, страховки, обмен валюты — объявление увидят все, кто планирует выезды.',
  url: 'https://t.me/medinah_jamiah',
  cta: 'Разместить объявление',
  placeholder: true,
};

export default ads;
