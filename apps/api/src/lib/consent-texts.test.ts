import { describe, expect, it } from 'vitest';
import { CONSENT_TEXT_VERSION, buildConsentTexts } from './consent-texts.js';

const federation = {
  nameRu: 'Федерация стритлифтинга Республики Татарстан',
  nameEn: 'Tatarstan Streetlifting Federation',
  contactEmail: 'info@fsrt.example',
  contactPhone: null,
  pdOperatorName: null,
  pdOperatorAddress: null,
  pdOperatorContact: null,
  privacyPolicyUrl: null,
};
const competition = { nameRu: 'Кубок Казани 2026', nameEn: 'Kazan Cup 2026' };

describe('buildConsentTexts', () => {
  it('binds the snapshot to the text, operator, organizer and language', () => {
    const context = { federation, competition, organizerName: 'Organizer' };
    const original = buildConsentTexts(context);
    expect(buildConsentTexts(context).snapshotHash).toBe(original.snapshotHash);
    expect(buildConsentTexts(context, 'en').snapshotHash).not.toBe(original.snapshotHash);
    expect(
      buildConsentTexts({ ...context, organizerName: 'Another organizer' }).snapshotHash,
    ).not.toBe(original.snapshotHash);
    expect(
      buildConsentTexts({
        ...context,
        federation: { ...federation, pdOperatorContact: 'new@example.test' },
      }).snapshotHash,
    ).not.toBe(original.snapshotHash);
  });
  it('falls back to the federation name and contact when operator requisites are missing', () => {
    const result = buildConsentTexts({ federation, competition, organizerName: null });
    expect(result.operatorConfigured).toBe(false);
    expect(result.operator.name).toBe(federation.nameRu);
    expect(result.operator.contact).toBe('info@fsrt.example');
    expect(result.texts.dataProcessing).toContain(federation.nameRu);
    expect(result.texts.dataProcessing).toContain('Кубок Казани 2026');
    expect(result.texts.dataProcessing).not.toContain('Ответственный за обработку');
    expect(result.textVersion).toBe(CONSENT_TEXT_VERSION);
  });

  it('uses configured operator requisites, organizer and policy link', () => {
    const result = buildConsentTexts({
      federation: {
        ...federation,
        pdOperatorName: 'РОО «ФСРТ»',
        pdOperatorAddress: '420000, Казань, ул. Спортивная, 1',
        pdOperatorContact: 'pd@fsrt.example',
        privacyPolicyUrl: 'https://fsrt.example/privacy',
      },
      competition,
      organizerName: 'Иванов И. И.',
    });
    expect(result.operatorConfigured).toBe(true);
    expect(result.texts.dataProcessing).toContain('РОО «ФСРТ», 420000, Казань');
    expect(result.texts.dataProcessing).toContain('контакт: pd@fsrt.example');
    expect(result.texts.dataProcessing).toContain(
      'Ответственный за обработку на соревновании: Иванов И. И.',
    );
    expect(result.texts.dataProcessing).toContain('https://fsrt.example/privacy');
    expect(result.texts.publicResults).toContain('РОО «ФСРТ»');
    expect(result.texts.photoPublication).toContain('Кубок Казани 2026');
  });

  it('renders English texts for the en locale', () => {
    const result = buildConsentTexts({ federation, competition, organizerName: null }, 'en');
    expect(result.locale).toBe('en');
    expect(result.operator.name).toBe(federation.nameEn);
    expect(result.texts.dataProcessing).toContain('Kazan Cup 2026');
  });
});
