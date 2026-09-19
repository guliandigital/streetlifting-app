import type { Role } from '@prisma/client';

/**
 * Confidentiality acknowledgment that every person admitted to other people's
 * personal data must accept before their role becomes active (152-ФЗ art. 7
 * confidentiality, art. 19 security measures). Recorded on the role
 * assignment with the text version, time, IP and User-Agent.
 *
 * Bump `ACCESS_ACKNOWLEDGMENT_VERSION` when the wording changes; roles
 * acknowledged under an older version become pending again.
 */
export const ACCESS_ACKNOWLEDGMENT_VERSION = '2026-09-19.v1';

/** Roles that see or edit other subjects' personal data. */
export const ROLES_REQUIRING_ACKNOWLEDGMENT: ReadonlySet<Role> = new Set<Role>([
  'federation_admin',
  'secretary',
  'accountant',
  'head_judge',
  'judge',
  'scoreboard_operator',
  'speaker',
]);

export function roleRequiresAcknowledgment(role: Role): boolean {
  return ROLES_REQUIRING_ACKNOWLEDGMENT.has(role);
}

export const ACCESS_ACKNOWLEDGMENT_TEXTS = {
  ru: [
    'Обязательство о неразглашении и правилах доступа к персональным данным.',
    'Получая роль в системе Streetlifting App, я подтверждаю, что:',
    '1. Буду использовать персональные данные спортсменов, судей и представителей федераций исключительно для выполнения функций по подготовке и проведению соревнований, поручённых мне федерацией — оператором персональных данных.',
    '2. Не буду передавать персональные данные третьим лицам, копировать их за пределы системы и публиковать сверх того, что предусмотрено регламентом соревнований и согласиями субъектов персональных данных.',
    '3. Не буду передавать свои учётные данные другим лицам и незамедлительно сообщу федерации об известных мне инцидентах: утечке, утрате устройства с открытой сессией, несанкционированном доступе.',
    '4. Понимаю, что мои действия в системе протоколируются с указанием времени, IP-адреса и учётной записи и могут быть предоставлены федерации и уполномоченным органам.',
    '5. Обязательство сохраняет силу после прекращения моего доступа.',
    'Основание: статьи 7 и 19 Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».',
  ].join('\n'),
  en: [
    'Confidentiality and access obligations for personal data.',
    'By accepting a role in Streetlifting App I confirm that:',
    '1. I will use the personal data of athletes, officials and federation representatives solely to perform the competition preparation and delivery duties assigned to me by the federation acting as the personal data operator.',
    '2. I will not disclose personal data to third parties, copy it outside the system or publish it beyond what competition regulations and the data subjects’ consents allow.',
    '3. I will not share my account credentials and will immediately report known incidents (leaks, a lost device with an open session, unauthorised access) to the federation.',
    '4. I understand that my actions in the system are logged with time, IP address and account and may be provided to the federation and authorised bodies.',
    '5. These obligations survive the termination of my access.',
    'Basis: articles 7 and 19 of Federal Law No. 152-FZ of 27 July 2006 “On Personal Data”.',
  ].join('\n'),
} as const;
