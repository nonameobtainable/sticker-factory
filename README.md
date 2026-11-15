# 🎨 «Фабрика стікерів та емодзі» (Sticker & Emoji Factory)

Повноцінний MVP Mini App для Telegram з HTML5 Canvas редактором та бекендом на Cloudflare Workers + Cloudflare D1.

---

## 📁 Структура проєкту

```text
sticker-factory/
├── docs/                       # Фронтенд (головна папка для GitHub Pages)
│   ├── index.html              # Розмітка Mini App, адаптована під тему Telegram
│   ├── style.css               # Стилі (підтримка теми Telegram, адаптивність під мобільні)
│   └── app.js                  # Canvas рушій (перетягування, зум, обводки, експорт WebP, Telegram SDK)
├── worker/                     # Бекенд (Cloudflare Worker + D1)
│   ├── src/
│   │   └── index.js            # Обробка initData (WebCrypto HMAC), робота з Telegram Bot API, D1 та Stars
│   ├── schema.sql              # SQL-структура таблиці користувачів для D1
│   ├── wrangler.toml           # Конфігурація розгортання Cloudflare Worker
│   ├── .dev.vars               # Локальні змінні та токен бота для тестування
│   └── package.json            # Скрипти розгортання та залежності
└── README.md                   # Детальна інструкція зі встановлення та запуску
```

---

## 🚀 Функціонал

### 1. Фронтенд (`/docs`):
- **Чистий стек**: HTML5, CSS3, Vanilla JS без важких фреймворків.
- **Повна інтеграція з Telegram**: використання CSS-змінних теми (`--tg-theme-*`), `Telegram.WebApp.ready()`, `expand()`, тактильний відгук (`HapticFeedback`).
- **Завантаження з галереї**: вибір фотографії безпосередньо зі смартфона.
- **HTML5 Canvas редактор**:
  - Масштабування двома пальцями (pinch-to-zoom) та перетягування фото пальцем.
  - Окремі кнопки швидкого керування зумом та центрування.
  - Додавання контурної обводки: без обводки, біла стікерна обводка, неонове сяйво (Cyan, Pink, Lime, Yellow).
  - Мемні написи (верхній та нижній текст) із класичною товстою чорною обводкою та налаштуванням розміру шрифту.
  - Перемикач режимів: **Стікер (512×512)** та **Емодзі (100×100)**.
- **Експорт у WebP**: автоматична компресія з гарантією розміру до 512 КБ (вимога Telegram).
- **Вибір емодзі-тригера**: швидкий вибір або ручне введення емодзі для стікера.
- **Покупка PRO-доступу**: інтеграція з Telegram Stars (`Telegram.WebApp.openInvoice`).

### 2. Бекенд (`/worker`):
- **Безпечна авторизація**: валідація підпису `initData` через вбудований WebCrypto API (HMAC-SHA256).
- **База даних D1 SQLite**: таблиця `users` (контроль кількості стікерів `stickers_count`, статусу `is_pro`, посилання на пак).
- **Тарифні ліміти**:
  - Безкоштовний режим: до 3 стікерів на акаунт.
  - PRO-режим: необмежена кількість стікерів та доступ до створення кастомних емодзі (100×100).
- **Створення стікерпаків Telegram**:
  - Виклики `uploadStickerFile` + `createNewStickerSet` (назва `pack_<user_id>_by_<BOT_USERNAME>`) або `addStickerToSet`.
  - Повернення прямого посилання на пак: `https://t.me/addstickers/<pack_name>`.
- **Оплата в Telegram Stars**:
  - Ендпоінт `/create-invoice` генерує посилання на рахунок у валюті `XTR`.
  - Вебхук `/webhook` підтверджує `pre_checkout_query` та при `successful_payment` оновлює статус користувача до `is_pro = 1`.

---

## 🛠️ Покрокова інструкція з налаштування

### Частина 1. Налаштування Cloudflare Workers + D1 (бекенд)

1. Відкрийте термінал у папці `worker`:
   ```bash
   cd worker
   ```

2. Авторизуйтесь у своєму обліковому записі Cloudflare:
   ```bash
   npx wrangler login
   ```
   *Відкриється вікно браузера — натисніть **Allow**.*

3. Створіть базу даних Cloudflare D1:
   ```bash
   npx wrangler d1 create sticker-db
   ```
   *У терміналі з'явиться рядок `database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`. Скопіюйте цей ID та замініть рядок `database_id = "YOUR_D1_DATABASE_ID"` у файлі `worker/wrangler.toml`.*

4. Накотіть SQL-міграцію у створену віддалену базу даних:
   ```bash
   npx wrangler d1 execute sticker-db --remote --file=./schema.sql
   ```

5. Додайте токен Telegram бота у безпечні секрети Cloudflare:
   ```bash
   npx wrangler secret put BOT_TOKEN
   ```
   *Введіть ваш токен від `@BotFather` (наприклад `9100505093:AAH-i2B5haXKxoUW5Ns-7BiUQe08rWAuMrE`) і натисніть Enter.*

6. Перевірте юзернейм бота у `worker/wrangler.toml`:
   ```toml
   [vars]
   BOT_USERNAME = "Stick2Snapbot"
   ```

7. Задеплойте Worker:
   ```bash
   npx wrangler deploy
   ```
   *Термінал видасть URL вашого бекенду, наприклад: `https://sticker-worker.yourname.workers.dev`.*

8. Прив'яжіть вебхук бота до Worker (виконайте один раз через браузер або curl):
   ```text
   https://api.telegram.org/bot<ВАШ_BOT_TOKEN>/setWebhook?url=https://sticker-worker.<ВАШ_НІК>.workers.dev/webhook
   ```
   *Має повернутися відповідь: `{"ok":true,"result":true,"description":"Webhook was set"}`.*

---

### Частина 2. Розгортання фронтенду на GitHub Pages

1. Завантажте репозиторій на GitHub.
2. Перейдіть до налаштувань репозиторію: **Settings** -> **Pages**.
3. У блоці **Build and deployment**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (або `master`), каталог `/docs`
   - Натисніть **Save**.
4. За декілька хвилин ваш сайт буде доступний за посиланням виду:
   `https://<ваш-юзернейм>.github.io/<назва-репозиторію>/`

---

### Частина 3. Підключення до Telegram Mini App

1. Відкрийте в Telegram бота `@BotFather`.
2. Відправте команду `/mybots` та виберіть свого бота (`@Stick2Snapbot`).
3. Перейдіть у **Bot Settings** -> **Menu Button** -> **Configure menu button**.
4. Введіть посилання на ваш GitHub Pages (наприклад, `https://username.github.io/sticker-factory/`) та назву кнопки (наприклад, `🎨 Відкрити фабрику`).
5. У міні-додатку відкрийте налаштування (іконка ⚙️) і введіть збережену адресу вашого Worker (`https://sticker-worker.yourname.workers.dev`). Адреса запам'ятовується автоматично!

Тепер ваш додаток повністю готовий до створення стікерів, емодзі та монетизації через Telegram Stars!
