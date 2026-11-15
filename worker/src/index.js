/**
 * Cloudflare Worker Backend for Telegram Sticker & Emoji Factory Mini App
 * - WebCrypto HMAC-SHA256 initData validation
 * - Cloudflare D1 database operations
 * - Telegram Bot API (uploadStickerFile, createNewStickerSet, addStickerToSet)
 * - Telegram Stars payments (/create-invoice, /webhook with pre_checkout_query & successful_payment)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(message, status = 400, extra = {}) {
  return jsonResponse({ ok: false, error: message, ...extra }, status);
}

/**
 * Validates Telegram WebApp initData using WebCrypto API (HMAC-SHA256)
 * @param {string} initData - Raw initData query string from window.Telegram.WebApp.initData
 * @param {string} botToken - Telegram Bot Token
 * @returns {Promise<object|null>} Parsed user object if valid, else null
 */
async function verifyTelegramWebAppData(initData, botToken) {
  if (!initData || typeof initData !== 'string') return null;

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    params.delete('hash');

    // Sort parameters alphabetically
    const sortedKeys = Array.from(params.keys()).sort();
    const dataCheckString = sortedKeys.map((key) => `${key}=${params.get(key)}`).join('\n');

    const encoder = new TextEncoder();

    // 1. Secret key = HMAC_SHA256("WebAppData", botToken)
    const webAppDataKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const secretKeyRaw = await crypto.subtle.sign('HMAC', webAppDataKey, encoder.encode(botToken));

    // 2. Hash calculation = HMAC_SHA256(secretKey, dataCheckString)
    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyRaw,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(dataCheckString));
    const calculatedHash = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) {
      return null;
    }

    // Check auth_date (allow within 7 days to prevent replay attacks)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400 * 7) {
      return null;
    }

    const userRaw = params.get('user');
    if (!userRaw) return null;
    return JSON.parse(userRaw);
  } catch (err) {
    console.error('Error verifying initData:', err);
    return null;
  }
}

/**
 * Database helpers for Cloudflare D1
 */
async function getOrCreateUser(db, userId) {
  let user = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
  if (!user) {
    await db
      .prepare('INSERT OR IGNORE INTO users (user_id, stickers_count, is_pro) VALUES (?, 0, 0)')
      .bind(userId)
      .run();
    user = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
  }
  return (
    user || {
      user_id: userId,
      stickers_count: 0,
      is_pro: 0,
      current_pack: null,
    }
  );
}

async function incrementUserStickers(db, userId, packName) {
  await db
    .prepare(
      `UPDATE users 
       SET stickers_count = stickers_count + 1,
           current_pack = ?,
           updated_at = CURRENT_TIMESTAMP 
       WHERE user_id = ?`
    )
    .bind(packName, userId)
    .run();
}

async function setUserPro(db, userId) {
  await db
    .prepare(
      `INSERT INTO users (user_id, stickers_count, is_pro)
       VALUES (?, 0, 1)
       ON CONFLICT(user_id) DO UPDATE SET is_pro = 1, updated_at = CURRENT_TIMESTAMP`
    )
    .bind(userId)
    .run();
}

/**
 * Worker Export
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const botToken = env.BOT_TOKEN;
    const botUsername = env.BOT_USERNAME || 'Stick2Snapbot';

    // 2. Health check / Root endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return jsonResponse({
        ok: true,
        service: 'Sticker & Emoji Factory Worker API',
        bot_username: botUsername,
        time: new Date().toISOString(),
      });
    }

    // 3. User status endpoint (/api/user-status)
    if (url.pathname === '/api/user-status') {
      try {
        let initData = '';
        if (request.method === 'POST') {
          const body = await request.json().catch(() => ({}));
          initData = body.initData || '';
        } else {
          initData = url.searchParams.get('initData') || '';
        }

        const user = await verifyTelegramWebAppData(initData, botToken);
        if (!user) {
          return errorResponse('Недійсні дані авторизації Telegram (initData)', 401);
        }

        const userData = await getOrCreateUser(env.DB, user.id);
        return jsonResponse({
          ok: true,
          user: {
            user_id: userData.user_id,
            first_name: user.first_name,
            stickers_count: userData.stickers_count || 0,
            is_pro: userData.is_pro === 1,
            current_pack: userData.current_pack,
          },
        });
      } catch (err) {
        return errorResponse(err.message || 'Внутрішня помилка сервера', 500);
      }
    }

    // 4. Create Invoice endpoint (/create-invoice or /api/create-invoice)
    if (url.pathname === '/create-invoice' || url.pathname === '/api/create-invoice') {
      if (request.method !== 'POST') {
        return errorResponse('Метод не підтримується. Використовуйте POST.', 405);
      }

      try {
        const body = await request.json().catch(() => ({}));
        const initData = body.initData;

        const user = await verifyTelegramWebAppData(initData, botToken);
        if (!user) {
          return errorResponse('Недійсні дані авторизації Telegram', 401);
        }

        const priceStars = parseInt(env.PRO_PRICE_STARS || '25', 10);

        // Telegram Bot API: createInvoiceLink with Telegram Stars (XTR)
        const invoicePayload = {
          title: 'Stick2Snap PRO Studio',
          description: 'Unlimited stickers & custom Telegram emoji sets (lifetime)',
          payload: JSON.stringify({ user_id: user.id, type: 'pro_upgrade' }),
          currency: 'XTR',
          prices: [{ label: 'Stick2Snap PRO', amount: priceStars }],
        };

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/createInvoiceLink`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoicePayload),
        });

        const tgData = await tgRes.json();
        if (!tgData.ok) {
          return errorResponse(`Invoice creation failed: ${tgData.description}`, 500);
        }

        return jsonResponse({
          ok: true,
          invoice_link: tgData.result,
        });
      } catch (err) {
        return errorResponse(err.message || 'Error creating invoice', 500);
      }
    }

    // 5. Upload sticker endpoint (/api/upload-sticker or /upload-sticker)
    if (url.pathname === '/api/upload-sticker' || url.pathname === '/upload-sticker') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed. Use POST.', 405);
      }

      try {
        const formData = await request.formData();
        const initData = formData.get('initData');
        const emoji = formData.get('emoji') || '😎';
        const mode = formData.get('mode') || 'regular'; // 'regular' or 'custom_emoji'
        const file = formData.get('file');

        if (!file || typeof file === 'string') {
          return errorResponse('No sticker file provided', 400);
        }

        // Validate Telegram initData
        const user = await verifyTelegramWebAppData(initData, botToken);
        if (!user) {
          return errorResponse('Invalid Telegram initData authorization', 401);
        }

        // Check file size (Telegram static sticker/emoji max 512 KB)
        if (file.size > 512 * 1024) {
          return errorResponse('File size exceeds 512 KB', 400);
        }

        // Check user & limits in D1
        const userData = await getOrCreateUser(env.DB, user.id);

        if (mode === 'custom_emoji' && userData.is_pro !== 1) {
          return errorResponse(
            'Custom emojis are only available for PRO members!',
            403,
            { code: 'PRO_REQUIRED' }
          );
        }

        if (userData.stickers_count >= 3 && userData.is_pro !== 1) {
          return errorResponse(
            'Free limit reached (3 stickers). Upgrade to PRO for unlimited stickers!',
            403,
            { code: 'LIMIT_REACHED' }
          );
        }

        // 1. Upload sticker file to Telegram
        const uploadForm = new FormData();
        uploadForm.append('user_id', String(user.id));
        uploadForm.append('sticker_format', 'static');
        uploadForm.append('sticker', file, 'sticker.webp');

        const uploadRes = await fetch(`https://api.telegram.org/bot${botToken}/uploadStickerFile`, {
          method: 'POST',
          body: uploadForm,
        });

        const uploadData = await uploadRes.json();
        if (!uploadData.ok) {
          return errorResponse(
            `Помилка завантаження файлу в Telegram: ${uploadData.description}`,
            500
          );
        }

        const stickerFileId = uploadData.result.file_id;

        // 2. Generate unique pack name according to Telegram rules
        // Short name must begin with letter, alphanumeric + underscores, end with _by_<bot_username>
        const cleanBot = botUsername.replace(/^@/, '');
        const isEmoji = mode === 'custom_emoji';
        const packPrefix = isEmoji ? 'emoji' : 'pack';
        const packName = `${packPrefix}_${user.id}_by_${cleanBot}`;
        const userTitle = user.first_name ? `${user.first_name}'s` : 'My';
        const packTitle = isEmoji ? `${userTitle} Custom Emoji` : `${userTitle} Sticker Pack`;

        // 3. Check if sticker set already exists
        const checkSetRes = await fetch(`https://api.telegram.org/bot${botToken}/getStickerSet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: packName }),
        });
        const checkSetData = await checkSetRes.json();

        if (checkSetData.ok) {
          // Add sticker to existing set
          const addStickerRes = await fetch(
            `https://api.telegram.org/bot${botToken}/addStickerToSet`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: user.id,
                name: packName,
                sticker: {
                  sticker: stickerFileId,
                  format: 'static',
                  emoji_list: [emoji],
                },
              }),
            }
          );

          const addData = await addStickerRes.json();
          if (!addData.ok) {
            return errorResponse(
              `Помилка додавання стікера до паку: ${addData.description}`,
              500
            );
          }
        } else {
          // Create new sticker set
          const createSetRes = await fetch(
            `https://api.telegram.org/bot${botToken}/createNewStickerSet`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                user_id: user.id,
                name: packName,
                title: packTitle,
                sticker_type: isEmoji ? 'custom_emoji' : 'regular',
                stickers: [
                  {
                    sticker: stickerFileId,
                    format: 'static',
                    emoji_list: [emoji],
                  },
                ],
              }),
            }
          );

          const createData = await createSetRes.json();
          if (!createData.ok) {
            return errorResponse(
              `Помилка створення стікерпаку: ${createData.description}`,
              500
            );
          }
        }

        // 4. Update stats in D1
        await incrementUserStickers(env.DB, user.id, packName);

        const packUrl = `https://t.me/addstickers/${packName}`;
        return jsonResponse({
          ok: true,
          pack_name: packName,
          pack_url: packUrl,
          stickers_count: (userData.stickers_count || 0) + 1,
          is_pro: userData.is_pro === 1,
        });
      } catch (err) {
        return errorResponse(err.message || 'Помилка збереження стікера', 500);
      }
    }

    // 6. Telegram Bot Webhook endpoint (/webhook)
    if (url.pathname === '/webhook') {
      if (request.method !== 'POST') {
        return errorResponse('Очікується POST запит', 405);
      }

      try {
        const update = await request.json().catch(() => null);
        if (!update) {
          return jsonResponse({ ok: true });
        }

        // 6a. Telegram Stars: Pre-checkout query confirmation
        if (update.pre_checkout_query) {
          await fetch(`https://api.telegram.org/bot${botToken}/answerPreCheckoutQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pre_checkout_query_id: update.pre_checkout_query.id,
              ok: true,
            }),
          });
          return jsonResponse({ ok: true });
        }

        // 6b. Successful payment handling
        if (update.message?.successful_payment) {
          const payment = update.message.successful_payment;
          let userId = update.message.from.id;

          try {
            const payload = JSON.parse(payment.invoice_payload);
            if (payload.user_id) userId = payload.user_id;
          } catch (_) {}

          // Upgrade user in D1
          await setUserPro(env.DB, userId);

          // Notify user in Telegram
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: update.message.chat.id,
              text:
                '🎉 **Welcome to Stick2Snap PRO!**\n\n' +
                '✨ Your account has been upgraded.\n' +
                'You now have unlimited sticker creation and full access to Custom Emojis (100×100 px).\n\n' +
                'Open the Mini App to start creating!',
              parse_mode: 'Markdown',
            }),
          });

          return jsonResponse({ ok: true });
        }

        // 6c. /start command
        if (update.message?.text?.startsWith('/start')) {
          const chatId = update.message.chat.id;
          const firstName = update.message.from?.first_name || 'friend';
          const frontendUrl =
            env.FRONTEND_URL || 'https://stick2snap.pages.dev';

          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text:
                `👋 Hi, ${firstName}!\n\n` +
                '🎨 Welcome to **Stick2Snap Studio** — the easiest way to turn any photo into Telegram stickers & custom emojis with vinyl borders and captions.\n\n' +
                'Tap the button below to open the studio 👇',
              parse_mode: 'Markdown',
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: '🚀 Open Stick2Snap Studio',
                      web_app: { url: frontendUrl },
                    },
                  ],
                ],
              },
            }),
          });

          return jsonResponse({ ok: true });
        }

        return jsonResponse({ ok: true });
      } catch (err) {
        console.error('Webhook error:', err);
        return jsonResponse({ ok: true }); // Always acknowledge to prevent Telegram retry spam
      }
    }

    return errorResponse('Маршрут не знайдено', 404);
  },
};
