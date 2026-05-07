/**
 * ISO 3166-2:RU subdivisions of the Russian Federation. Codes follow
 * the published standard; names are the conventional Russian short
 * forms plus the standard English transliterations.
 *
 * Republics, krais, oblasts, autonomous okrugs, the autonomous oblast,
 * and federal cities are all included. Sort order roughly follows
 * federal-district groupings (Moscow first, then SPb, then alphabetical
 * within blocks).
 */

export interface RegionEntry {
  codeIso: string;
  nameRu: string;
  nameEn: string;
}

export const RF_REGIONS: ReadonlyArray<RegionEntry> = [
  // Federal cities first (most common origin)
  { codeIso: 'RU-MOW', nameRu: 'Москва',                       nameEn: 'Moscow' },
  { codeIso: 'RU-SPE', nameRu: 'Санкт-Петербург',              nameEn: 'Saint Petersburg' },
  { codeIso: 'RU-SEV', nameRu: 'Севастополь',                  nameEn: 'Sevastopol' },
  // Republics
  { codeIso: 'RU-AD',  nameRu: 'Республика Адыгея',            nameEn: 'Adygea' },
  { codeIso: 'RU-AL',  nameRu: 'Республика Алтай',             nameEn: 'Altai Republic' },
  { codeIso: 'RU-BA',  nameRu: 'Республика Башкортостан',      nameEn: 'Bashkortostan' },
  { codeIso: 'RU-BU',  nameRu: 'Республика Бурятия',           nameEn: 'Buryatia' },
  { codeIso: 'RU-CE',  nameRu: 'Чеченская Республика',         nameEn: 'Chechnya' },
  { codeIso: 'RU-CU',  nameRu: 'Чувашская Республика',         nameEn: 'Chuvashia' },
  { codeIso: 'RU-DA',  nameRu: 'Республика Дагестан',          nameEn: 'Dagestan' },
  { codeIso: 'RU-IN',  nameRu: 'Республика Ингушетия',         nameEn: 'Ingushetia' },
  { codeIso: 'RU-KB',  nameRu: 'Кабардино-Балкарская Республика', nameEn: 'Kabardino-Balkaria' },
  { codeIso: 'RU-KC',  nameRu: 'Карачаево-Черкесская Республика', nameEn: 'Karachay-Cherkessia' },
  { codeIso: 'RU-KL',  nameRu: 'Республика Калмыкия',          nameEn: 'Kalmykia' },
  { codeIso: 'RU-KO',  nameRu: 'Республика Коми',              nameEn: 'Komi' },
  { codeIso: 'RU-KR',  nameRu: 'Республика Карелия',           nameEn: 'Karelia' },
  { codeIso: 'RU-ME',  nameRu: 'Республика Марий Эл',          nameEn: 'Mari El' },
  { codeIso: 'RU-MO',  nameRu: 'Республика Мордовия',          nameEn: 'Mordovia' },
  { codeIso: 'RU-SA',  nameRu: 'Республика Саха (Якутия)',     nameEn: 'Sakha (Yakutia)' },
  { codeIso: 'RU-SE',  nameRu: 'Республика Северная Осетия — Алания', nameEn: 'North Ossetia–Alania' },
  { codeIso: 'RU-TA',  nameRu: 'Республика Татарстан',         nameEn: 'Tatarstan' },
  { codeIso: 'RU-TY',  nameRu: 'Республика Тыва',              nameEn: 'Tuva' },
  { codeIso: 'RU-UD',  nameRu: 'Удмуртская Республика',        nameEn: 'Udmurtia' },
  { codeIso: 'RU-KK',  nameRu: 'Республика Хакасия',           nameEn: 'Khakassia' },
  // Krais
  { codeIso: 'RU-ALT', nameRu: 'Алтайский край',               nameEn: 'Altai Krai' },
  { codeIso: 'RU-KAM', nameRu: 'Камчатский край',              nameEn: 'Kamchatka Krai' },
  { codeIso: 'RU-KHA', nameRu: 'Хабаровский край',             nameEn: 'Khabarovsk Krai' },
  { codeIso: 'RU-KDA', nameRu: 'Краснодарский край',           nameEn: 'Krasnodar Krai' },
  { codeIso: 'RU-KYA', nameRu: 'Красноярский край',            nameEn: 'Krasnoyarsk Krai' },
  { codeIso: 'RU-PER', nameRu: 'Пермский край',                nameEn: 'Perm Krai' },
  { codeIso: 'RU-PRI', nameRu: 'Приморский край',              nameEn: 'Primorsky Krai' },
  { codeIso: 'RU-STA', nameRu: 'Ставропольский край',          nameEn: 'Stavropol Krai' },
  { codeIso: 'RU-ZAB', nameRu: 'Забайкальский край',           nameEn: 'Zabaykalsky Krai' },
  // Oblasts
  { codeIso: 'RU-AMU', nameRu: 'Амурская область',             nameEn: 'Amur Oblast' },
  { codeIso: 'RU-ARK', nameRu: 'Архангельская область',        nameEn: 'Arkhangelsk Oblast' },
  { codeIso: 'RU-AST', nameRu: 'Астраханская область',         nameEn: 'Astrakhan Oblast' },
  { codeIso: 'RU-BEL', nameRu: 'Белгородская область',         nameEn: 'Belgorod Oblast' },
  { codeIso: 'RU-BRY', nameRu: 'Брянская область',             nameEn: 'Bryansk Oblast' },
  { codeIso: 'RU-CHE', nameRu: 'Челябинская область',          nameEn: 'Chelyabinsk Oblast' },
  { codeIso: 'RU-IRK', nameRu: 'Иркутская область',            nameEn: 'Irkutsk Oblast' },
  { codeIso: 'RU-IVA', nameRu: 'Ивановская область',           nameEn: 'Ivanovo Oblast' },
  { codeIso: 'RU-KGD', nameRu: 'Калининградская область',      nameEn: 'Kaliningrad Oblast' },
  { codeIso: 'RU-KLU', nameRu: 'Калужская область',            nameEn: 'Kaluga Oblast' },
  { codeIso: 'RU-KEM', nameRu: 'Кемеровская область — Кузбасс', nameEn: 'Kemerovo Oblast (Kuzbass)' },
  { codeIso: 'RU-KIR', nameRu: 'Кировская область',            nameEn: 'Kirov Oblast' },
  { codeIso: 'RU-KOS', nameRu: 'Костромская область',          nameEn: 'Kostroma Oblast' },
  { codeIso: 'RU-KGN', nameRu: 'Курганская область',           nameEn: 'Kurgan Oblast' },
  { codeIso: 'RU-KRS', nameRu: 'Курская область',              nameEn: 'Kursk Oblast' },
  { codeIso: 'RU-LEN', nameRu: 'Ленинградская область',        nameEn: 'Leningrad Oblast' },
  { codeIso: 'RU-LIP', nameRu: 'Липецкая область',             nameEn: 'Lipetsk Oblast' },
  { codeIso: 'RU-MAG', nameRu: 'Магаданская область',          nameEn: 'Magadan Oblast' },
  { codeIso: 'RU-MOS', nameRu: 'Московская область',           nameEn: 'Moscow Oblast' },
  { codeIso: 'RU-MUR', nameRu: 'Мурманская область',           nameEn: 'Murmansk Oblast' },
  { codeIso: 'RU-NIZ', nameRu: 'Нижегородская область',        nameEn: 'Nizhny Novgorod Oblast' },
  { codeIso: 'RU-NGR', nameRu: 'Новгородская область',         nameEn: 'Novgorod Oblast' },
  { codeIso: 'RU-NVS', nameRu: 'Новосибирская область',        nameEn: 'Novosibirsk Oblast' },
  { codeIso: 'RU-OMS', nameRu: 'Омская область',               nameEn: 'Omsk Oblast' },
  { codeIso: 'RU-ORE', nameRu: 'Оренбургская область',         nameEn: 'Orenburg Oblast' },
  { codeIso: 'RU-ORL', nameRu: 'Орловская область',            nameEn: 'Oryol Oblast' },
  { codeIso: 'RU-PNZ', nameRu: 'Пензенская область',           nameEn: 'Penza Oblast' },
  { codeIso: 'RU-PSK', nameRu: 'Псковская область',            nameEn: 'Pskov Oblast' },
  { codeIso: 'RU-ROS', nameRu: 'Ростовская область',           nameEn: 'Rostov Oblast' },
  { codeIso: 'RU-RYA', nameRu: 'Рязанская область',            nameEn: 'Ryazan Oblast' },
  { codeIso: 'RU-SAK', nameRu: 'Сахалинская область',          nameEn: 'Sakhalin Oblast' },
  { codeIso: 'RU-SAM', nameRu: 'Самарская область',            nameEn: 'Samara Oblast' },
  { codeIso: 'RU-SAR', nameRu: 'Саратовская область',          nameEn: 'Saratov Oblast' },
  { codeIso: 'RU-SMO', nameRu: 'Смоленская область',           nameEn: 'Smolensk Oblast' },
  { codeIso: 'RU-SVE', nameRu: 'Свердловская область',         nameEn: 'Sverdlovsk Oblast' },
  { codeIso: 'RU-TAM', nameRu: 'Тамбовская область',           nameEn: 'Tambov Oblast' },
  { codeIso: 'RU-TOM', nameRu: 'Томская область',              nameEn: 'Tomsk Oblast' },
  { codeIso: 'RU-TUL', nameRu: 'Тульская область',             nameEn: 'Tula Oblast' },
  { codeIso: 'RU-TVE', nameRu: 'Тверская область',             nameEn: 'Tver Oblast' },
  { codeIso: 'RU-TYU', nameRu: 'Тюменская область',            nameEn: 'Tyumen Oblast' },
  { codeIso: 'RU-ULY', nameRu: 'Ульяновская область',          nameEn: 'Ulyanovsk Oblast' },
  { codeIso: 'RU-VLA', nameRu: 'Владимирская область',         nameEn: 'Vladimir Oblast' },
  { codeIso: 'RU-VGG', nameRu: 'Волгоградская область',        nameEn: 'Volgograd Oblast' },
  { codeIso: 'RU-VLG', nameRu: 'Вологодская область',          nameEn: 'Vologda Oblast' },
  { codeIso: 'RU-VOR', nameRu: 'Воронежская область',          nameEn: 'Voronezh Oblast' },
  { codeIso: 'RU-YAR', nameRu: 'Ярославская область',          nameEn: 'Yaroslavl Oblast' },
  // Autonomous okrugs / oblast
  { codeIso: 'RU-CHU', nameRu: 'Чукотский автономный округ',   nameEn: 'Chukotka Autonomous Okrug' },
  { codeIso: 'RU-KHM', nameRu: 'Ханты-Мансийский автономный округ — Югра', nameEn: 'Khanty-Mansi Autonomous Okrug – Ugra' },
  { codeIso: 'RU-NEN', nameRu: 'Ненецкий автономный округ',    nameEn: 'Nenets Autonomous Okrug' },
  { codeIso: 'RU-YAN', nameRu: 'Ямало-Ненецкий автономный округ', nameEn: 'Yamalo-Nenets Autonomous Okrug' },
  { codeIso: 'RU-YEV', nameRu: 'Еврейская автономная область', nameEn: 'Jewish Autonomous Oblast' },
  // Crimea
  { codeIso: 'RU-CR',  nameRu: 'Республика Крым',              nameEn: 'Crimea' },
];
