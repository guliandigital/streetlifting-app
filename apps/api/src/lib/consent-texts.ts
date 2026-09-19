/**
 * Consent texts shown to athletes at public registration and stored verbatim
 * in `consent.textShown`. Built server-side from the federation's operator
 * requisites so the text the athlete saw and the text we keep are the same
 * object (152-ФЗ art. 9: a consent must name the operator, the purposes, the
 * data, the actions, the term and how it is withdrawn).
 *
 * Bump `CONSENT_TEXT_VERSION` whenever the wording changes; old consents keep
 * their own `textVersion`.
 */
import { createHash } from 'node:crypto';

export const CONSENT_TEXT_VERSION = '2026-09-19.v2';

/** Processor acting on the operator's instructions (152-ФЗ art. 6 part 3). */
export const PLATFORM_PROCESSOR_NAME =
  process.env.PD_PROCESSOR_NAME?.trim() || 'ИП Гулян А. Г. (платформа Streetlifting App)';

export type ConsentLocale = 'ru' | 'en';

export interface ConsentOperatorSource {
  nameRu: string;
  nameEn: string;
  contactEmail: string | null;
  contactPhone: string | null;
  pdOperatorName: string | null;
  pdOperatorAddress: string | null;
  pdOperatorContact: string | null;
  privacyPolicyUrl: string | null;
}

export interface ConsentContext {
  federation: ConsentOperatorSource;
  competition: { nameRu: string; nameEn: string };
  /** Confirmed organizer responsible for processing at the event, if any. */
  organizerName: string | null;
}

export interface ConsentTexts {
  snapshotHash: string;
  textVersion: string;
  locale: ConsentLocale;
  /** False when the federation has not filled in its operator requisites yet. */
  operatorConfigured: boolean;
  operator: {
    name: string;
    address: string | null;
    contact: string | null;
    privacyPolicyUrl: string | null;
    processor: string;
    organizerName: string | null;
  };
  texts: {
    dataProcessing: string;
    publicResults: string;
    photoPublication: string;
  };
}

function operatorBlock(f: ConsentOperatorSource, locale: ConsentLocale) {
  const configured = Boolean(f.pdOperatorName?.trim());
  const name = f.pdOperatorName?.trim() || (locale === 'ru' ? f.nameRu : f.nameEn);
  const address = f.pdOperatorAddress?.trim() || null;
  const contact = f.pdOperatorContact?.trim() || f.contactEmail || f.contactPhone || null;
  const privacyPolicyUrl = f.privacyPolicyUrl?.trim() || null;
  return { configured, name, address, contact, privacyPolicyUrl };
}

function requisites(op: ReturnType<typeof operatorBlock>, locale: ConsentLocale): string {
  const parts = [op.name];
  if (op.address) parts.push(op.address);
  if (op.contact) parts.push(`${locale === 'ru' ? 'контакт' : 'contact'}: ${op.contact}`);
  return parts.join(', ');
}

export function buildConsentTexts(ctx: ConsentContext, locale: ConsentLocale = 'ru'): ConsentTexts {
  const op = operatorBlock(ctx.federation, locale);
  const who = requisites(op, locale);
  const competition = locale === 'ru' ? ctx.competition.nameRu : ctx.competition.nameEn;
  const processor = PLATFORM_PROCESSOR_NAME;
  const organizer = ctx.organizerName?.trim() || null;

  const texts =
    locale === 'ru'
      ? {
          dataProcessing:
            `Я даю согласие оператору персональных данных — ${who} — на обработку моих ` +
            `персональных данных: фамилия, имя, отчество, дата рождения, пол, страна, регион, ` +
            `город, спортивный клуб, тренер, контактный телефон и e-mail, вес тела на ` +
            `взвешивании, результаты выступлений, — с целью регистрации и допуска к соревнованию ` +
            `«${competition}», ведения протоколов, рейтингов и рекордов федерации. Разрешённые ` +
            `действия: сбор, запись, систематизация, накопление, хранение, уточнение, ` +
            `извлечение, использование, передача (предоставление, доступ) организатору и ` +
            `судейской коллегии соревнования, обезличивание, блокирование, удаление, ` +
            `уничтожение, с использованием средств автоматизации. Обработку по поручению ` +
            `оператора выполняет ${processor}.` +
            (organizer ? ` Ответственный за обработку на соревновании: ${organizer}.` : '') +
            ` Согласие действует с момента предоставления в течение срока хранения спортивных ` +
            `протоколов и может быть отозвано заявлением оператору по указанному контакту; ` +
            `отзыв не затрагивает обработку, необходимую для сохранения официальных результатов.` +
            (op.privacyPolicyUrl ? ` Политика обработки: ${op.privacyPolicyUrl}` : ''),
          publicResults:
            `Я даю согласие оператору персональных данных — ${op.name} — на распространение ` +
            `моих персональных данных: фамилия, имя, отчество, год рождения, клуб, ` +
            `страна/регион, весовая категория и результаты выступления на соревновании ` +
            `«${competition}» — путём публикации в протоколах, на табло и в открытых ` +
            `результатах на сайтах федерации и платформы Streetlifting App неограниченному ` +
            `кругу лиц. Согласие может быть отозвано заявлением оператору по указанному контакту.`,
          photoPublication:
            `Я даю согласие оператору персональных данных — ${op.name} — на публикацию моей ` +
            `фотографии и фото-/видеоматериалов соревнования «${competition}» с моим ` +
            `изображением на табло, в открытых результатах, на сайтах и в социальных сетях ` +
            `федерации и платформы Streetlifting App. Согласие может быть отозвано заявлением ` +
            `оператору по указанному контакту.`,
        }
      : {
          dataProcessing:
            `I consent to the personal data operator — ${who} — processing my personal data ` +
            `(surname, first name, patronymic, date of birth, gender, country, region, city, ` +
            `club, coach, contact phone and e-mail, bodyweight at weigh-in, competition ` +
            `results) for registration and admission to «${competition}» and for keeping the ` +
            `federation's protocols, rankings and records. Permitted actions: collection, ` +
            `recording, systematisation, accumulation, storage, updating, retrieval, use, ` +
            `transfer (provision, access) to the competition organizer and judging panel, ` +
            `anonymisation, blocking, deletion and destruction, using automated means. ` +
            `Processing on the operator's behalf is performed by ${processor}.` +
            (organizer ? ` Responsible for processing at the event: ${organizer}.` : '') +
            ` The consent is valid from the moment it is given for the retention period of ` +
            `competition protocols and may be withdrawn by a request to the operator at the ` +
            `contact above; withdrawal does not affect processing required to preserve official ` +
            `results.` +
            (op.privacyPolicyUrl ? ` Privacy policy: ${op.privacyPolicyUrl}` : ''),
          publicResults:
            `I consent to the personal data operator — ${op.name} — making my personal data ` +
            `public (surname, first name, patronymic, year of birth, club, country/region, ` +
            `weight class and results at «${competition}») in protocols, on the scoreboard and ` +
            `in open results on the federation's and Streetlifting App websites. The consent ` +
            `may be withdrawn by a request to the operator at the contact above.`,
          photoPublication:
            `I consent to the personal data operator — ${op.name} — publishing my photo and ` +
            `photo/video materials of «${competition}» featuring me on the scoreboard, in open ` +
            `results, on the federation's and Streetlifting App websites and social media. The ` +
            `consent may be withdrawn by a request to the operator at the contact above.`,
        };

  return {
    snapshotHash: createHash('sha256')
      .update(JSON.stringify({ version: CONSENT_TEXT_VERSION, locale, texts }))
      .digest('hex'),
    textVersion: CONSENT_TEXT_VERSION,
    locale,
    operatorConfigured: op.configured,
    operator: {
      name: op.name,
      address: op.address,
      contact: op.contact,
      privacyPolicyUrl: op.privacyPolicyUrl,
      processor,
      organizerName: organizer,
    },
    texts,
  };
}
