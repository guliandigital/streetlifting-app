import type { WorkspaceIconName } from '../../components/workspace.js';
import type { PrintableReportKind } from './report-printables.js';

export type ReportExportKind = 'protocol' | 'accounting';
export type ReportExportFormat = 'csv' | 'xlsx';

export type ReportPendingReason =
  | 'template_missing'
  | 'external_format_contract'
  | 'external_api_contract'
  | 'telegram_auth_contract';

interface BaseReportAction {
  id: string;
  label: string;
  icon: WorkspaceIconName;
  tone?: 'green';
}

export type ReportAction =
  | (BaseReportAction & {
      state: 'printable';
      printableKind: PrintableReportKind;
    })
  | (BaseReportAction & {
      state: 'export';
      exportKind: ReportExportKind;
      exportFormat: ReportExportFormat;
    })
  | (BaseReportAction & {
      state: 'pending';
      pendingReason: ReportPendingReason;
    });

export const REPORT_ACTIONS = {
  fprProtocols: [
    {
      id: 'fpr-detailed',
      label: 'Подробный',
      icon: 'document',
      state: 'pending',
      pendingReason: 'template_missing',
    },
    {
      id: 'fpr-compact',
      label: 'Сжатый',
      icon: 'document',
      state: 'pending',
      pendingReason: 'template_missing',
    },
    {
      id: 'fpr-short',
      label: 'Сокращённый',
      icon: 'document',
      state: 'pending',
      pendingReason: 'template_missing',
    },
    {
      id: 'asp-powerlifting',
      label: 'Выгрузка в АСП Паурлифтинг',
      icon: 'document',
      state: 'pending',
      pendingReason: 'external_format_contract',
    },
  ],
  protocolDisciplineSheets: [
    {
      id: 'protocol-xlsx-separate-sheets',
      label: 'Дисциплины на отдельном листе',
      icon: 'chart',
      tone: 'green',
      state: 'export',
      exportKind: 'protocol',
      exportFormat: 'xlsx',
    },
    {
      id: 'protocol-xlsx-one-sheet',
      label: 'Дисциплины на одном листе',
      icon: 'chart',
      tone: 'green',
      state: 'export',
      exportKind: 'protocol',
      exportFormat: 'xlsx',
    },
  ],
  protocolExternalFiles: [
    {
      id: 'protocol-csv',
      label: 'Итоговый протокол CSV',
      icon: 'document',
      state: 'export',
      exportKind: 'protocol',
      exportFormat: 'csv',
    },
    {
      id: 'protocol-english-xlsx',
      label: 'Итоговый протокол (ENGLISH) XLSX',
      icon: 'document',
      state: 'export',
      exportKind: 'protocol',
      exportFormat: 'xlsx',
    },
  ],
  externalFederationFormats: [
    {
      id: 'wrpf-wepf-summary',
      label: 'Итоговый протокол',
      icon: 'document',
      state: 'pending',
      pendingReason: 'external_format_contract',
    },
    {
      id: 'wrpf-wepf-xlsx',
      label: 'Выгрузка XLSX',
      icon: 'chart',
      state: 'pending',
      pendingReason: 'external_format_contract',
    },
  ],
  externalServices: [
    {
      id: 'allpowerlifting-v1',
      label: 'allpowerlifting.com v1 от 09.2020',
      icon: 'link',
      state: 'pending',
      pendingReason: 'external_api_contract',
    },
    {
      id: 'allpowerlifting-api',
      label: 'Прямая через API allpowerlifting.com (тест)',
      icon: 'link',
      state: 'pending',
      pendingReason: 'external_api_contract',
    },
    {
      id: 'openpowerlifting',
      label: 'OpenPowerLifting',
      icon: 'link',
      state: 'pending',
      pendingReason: 'external_api_contract',
    },
  ],
  blanks: [
    {
      id: 'weigh-in-blank',
      label: 'Бланк весов',
      icon: 'print',
      state: 'printable',
      printableKind: 'weighInBlank',
    },
    {
      id: 'attempt-sheet',
      label: 'Бланк попыток (3 подхода)',
      icon: 'print',
      state: 'printable',
      printableKind: 'attemptSheet',
    },
    {
      id: 'judge-decision-blank',
      label: 'Бланк решения судей',
      icon: 'print',
      state: 'printable',
      printableKind: 'judgeDecisionBlank',
    },
    {
      id: 'protocol-vk-blank',
      label: 'Бланк протокола ВК',
      icon: 'print',
      state: 'printable',
      printableKind: 'protocolVkBlank',
    },
  ],
  nominations: [
    {
      id: 'nominations-all',
      label: 'Все номинации',
      icon: 'nomination',
      state: 'printable',
      printableKind: 'nominationsAll',
    },
    {
      id: 'nominations-groups',
      label: 'По группам',
      icon: 'nomination',
      state: 'printable',
      printableKind: 'nominationsByGroups',
    },
    {
      id: 'nominations-platforms',
      label: 'По помостам',
      icon: 'nomination',
      state: 'printable',
      printableKind: 'nominationsByPlatforms',
    },
  ],
  judges: [
    {
      id: 'judge-assignments-ru',
      label: 'Печать назначения судей',
      icon: 'judges',
      state: 'printable',
      printableKind: 'judgeAssignments',
    },
    {
      id: 'judge-assignments-en',
      label: 'Печать назначения судей (English)',
      icon: 'judges',
      state: 'printable',
      printableKind: 'judgeAssignmentsEn',
    },
    {
      id: 'telegram-quick-auth-codes',
      label: 'Печать кодов быстрой авторизации в телеграм',
      icon: 'telegram',
      state: 'pending',
      pendingReason: 'telegram_auth_contract',
    },
  ],
  cards: [
    {
      id: 'athlete-cards-a4',
      label: 'Карточки A4',
      icon: 'list',
      state: 'printable',
      printableKind: 'athleteCardsA4',
    },
    {
      id: 'athlete-cards-a5',
      label: 'Карточки A5 на 2 на лист',
      icon: 'list',
      state: 'printable',
      printableKind: 'athleteCardsA5',
    },
    {
      id: 'athlete-cards-weighed-in',
      label: 'Карточки только взвешенных',
      icon: 'list',
      state: 'printable',
      printableKind: 'athleteCardsWeighedIn',
    },
  ],
  schedule: [
    {
      id: 'schedule-full',
      label: 'Полное расписание',
      icon: 'history',
      state: 'printable',
      printableKind: 'scheduleFull',
    },
    {
      id: 'schedule-platforms',
      label: 'По помостам',
      icon: 'history',
      state: 'printable',
      printableKind: 'schedulePlatforms',
    },
    {
      id: 'schedule-groups',
      label: 'По группам',
      icon: 'history',
      state: 'printable',
      printableKind: 'scheduleGroups',
    },
  ],
  finance: [
    {
      id: 'accounting-csv',
      label: 'Бухгалтерия CSV',
      icon: 'billing',
      state: 'export',
      exportKind: 'accounting',
      exportFormat: 'csv',
    },
    {
      id: 'accounting-xlsx',
      label: 'Бухгалтерия XLSX',
      icon: 'chart',
      state: 'export',
      exportKind: 'accounting',
      exportFormat: 'xlsx',
    },
  ],
  references: [
    {
      id: 'participation-references',
      label: 'Справка об участии',
      icon: 'certificate',
      state: 'printable',
      printableKind: 'participationReferences',
    },
    {
      id: 'thank-you-letters',
      label: 'Благодарственное письмо',
      icon: 'certificate',
      state: 'printable',
      printableKind: 'thankYouLetters',
    },
  ],
} as const satisfies Record<string, readonly ReportAction[]>;
