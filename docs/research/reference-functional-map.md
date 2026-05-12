# Workspace reference functional map

Reference for V2 parity. Pulled from screenshots taken 2026-05-07.

## Sidebar (main navigation)

| Reference section                     | V2 page                               | Domain entities             |
| ------------------------------------- | ------------------------------------- | --------------------------- |
| Справочники                           | global admin route                    | (cross-cutting)             |
| Соревнования                          | `/competitions`                       | Competition                 |
| Спортсмены                            | `/athletes`                           | Athlete                     |
| Номинации спортсменов                 | `/competitions/:id/nominations`       | Nomination                  |
| Номинации судей / Судьи               | `/competitions/:id/judges`, `/judges` | Judge, JudgeAssignment      |
| Распределение по потокам и группам    | `/competitions/:id/schedule`          | Flight, Group, Platform     |
| Отчёты, печатные формы                | `/competitions/:id/reports`           | (read-only views over all)  |
| Печать грамот                         | `/competitions/:id/certificates`      | Certificate                 |
| Награждение                           | `/competitions/:id/awards`            | Award                       |
| Оператор табло                        | `/competitions/:id/operator`          | Attempt (write) + broadcast |
| Склад                                 | `/federation/inventory`               | InventoryItem               |
| Уведомления                           | `/federation/notifications`           | NotificationPreference      |
| Информационные таблицы для трансляций | `/broadcast/...` (public read-only)   | (broadcast subscriber)      |

## Federation home page ("Начальная страница")

Sections seen on screenshot:

- **Поступления** — receipts list, columns: number, date, nominations count, amount, expiration
- **Списания** — writeoffs list, columns: number, date, nominations consumed
- **Остаток на дату** — running balance ("Номинаций: 0")
- **Footer billing line** — "Количество выступивших номинаций за период с X по Y составило: N. Ваш расчётный тариф: T руб за 1 реально выступившую номинацию"
- **Telegram bot prompt** — "Streetlifting bot, отправьте код NNNNNNNNN для уведомлений"
- **Файлы для отображения на странице федерации** — file uploads
- **График** — sparkline comparing federations within the region

V2 parity: yes, all of it. Charts via `recharts`. File uploads via S3-compatible (we'll use the same reg.ru host's filesystem in V1; abstract behind a service).

## Settings / feedback page ("Обращения, настройки")

- Language switch (RU ⇄ EN)
- Contact info: phone, telegram, vk, email
- "Не отправлять уведомления о новых регистрациях" toggle
- ФИО Главного бухгалтера, ФИО Кассира
- Ключ защиты (security_key)
- "Закрыть свободный онлайн доступ к результатам соревнований" toggle
- Сменить пароль
- История изменений и доработок (= public changelog)
- Тест письмо button (verify email config)
- Inbound feedback thread with timestamps (Автор, Дата, Содержание / Ответ)

V2 parity: yes. The feedback thread is just SupportTicket with replies; the changelog link is a static markdown page; the test letter button is `POST /federation/:id/test-email`.

## Tab strip

The reference workflow keeps many tabs open simultaneously: Начальная, Соревнования, Спортсмены, Склад, Номинации спортсменов, athlete card. Modern web doesn't need this — TanStack Router handles deep linking and back/forward. We **do not** replicate the tabbed window.

## Connection-quality widget

Bottom-left of the reference screenshots: "Среднее значение качества связи с сервером [302мс]" with rolling history.

V2: yes — it's actually useful. Bottom-status bar component subscribes to WS heartbeats, shows online/offline + RTT.

## What we drop entirely

- The 1С launch dialog ("Запуск 1С:Предприятия")
- The 1С splash screen
- Any 1С-specific configuration UI

## What we add

- Modern keyboard navigation (j/k row movement, `/` to focus search, `?` for shortcut help)
- Command palette (`Cmd+K` / `Ctrl+K`) for cross-app navigation
- Dark mode
- Real-time collaboration indicators ("3 secretaries viewing this competition")
- Mobile-friendly judge tablet PWA
- OBS-ready broadcast overlays
