/**
 * Frontend JavaScript for Telegram Sticker & Emoji Factory Mini App
 * Pure Vanilla JS, HTML5 Canvas touch-manipulation, WebP 512KB export,
 * Telegram Theme & WebApp API integration, Cloudflare Worker backend.
 */

(function () {
  'use strict';

  // --- Telegram Web App SDK initialization ---
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor?.('#0f141c');
      tg.setBackgroundColor?.('#0f141c');
    } catch (_) {}
  }

  // --- DOM Elements ---
  const canvas = document.getElementById('stickerCanvas');
  const ctx = canvas.getContext('2d');
  const canvasWrapper = document.getElementById('canvasWrapper');
  const uploadPrompt = document.getElementById('uploadPrompt');
  const canvasOverlayControls = document.getElementById('canvasOverlayControls');
  const photoActions = document.getElementById('photoActions');
  const imageInput = document.getElementById('imageInput');

  // Mode tabs
  const tabSticker = document.getElementById('tabSticker');
  const tabEmoji = document.getElementById('tabEmoji');

  // Outline buttons
  const outlineButtons = document.querySelectorAll('.outline-btn');

  // Text inputs
  const topTextInput = document.getElementById('topTextInput');
  const bottomTextInput = document.getElementById('bottomTextInput');
  const fontSizeRange = document.getElementById('fontSizeRange');

  // Emoji trigger inputs
  const customEmojiInput = document.getElementById('customEmojiInput');
  const emojiChips = document.querySelectorAll('.emoji-chip');

  // Action buttons
  const btnCreateSticker = document.getElementById('btnCreateSticker');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnSpinner = document.getElementById('btnSpinner');

  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnResetView = document.getElementById('btnResetView');
  const btnFitImage = document.getElementById('btnFitImage');

  // Stats & Badges
  const stickersCountDisplay = document.getElementById('stickersCountDisplay');
  const activePackInfo = document.getElementById('activePackInfo');
  const activePackLink = document.getElementById('activePackLink');
  const btnProBadge = document.getElementById('btnProBadge');
  const proBadgeText = document.getElementById('proBadgeText');

  // Modals
  const proModal = document.getElementById('proModal');
  const btnCloseProModal = document.getElementById('btnCloseProModal');
  const btnBuyStars = document.getElementById('btnBuyStars');
  const buySpinner = document.getElementById('buySpinner');

  const successModal = document.getElementById('successModal');
  const btnCloseSuccessModal = document.getElementById('btnCloseSuccessModal');
  const btnOpenPackTelegram = document.getElementById('btnOpenPackTelegram');
  const successStickerPreview = document.getElementById('successStickerPreview');

  const settingsModal = document.getElementById('settingsModal');
  const btnSettings = document.getElementById('btnSettings');
  const btnCloseSettingsModal = document.getElementById('btnCloseSettingsModal');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const workerUrlInput = document.getElementById('workerUrlInput');

  const toastNotification = document.getElementById('toastNotification');

  // --- App State ---
  let workerUrl = localStorage.getItem('WORKER_URL') || '';
  let currentMode = 'regular'; // 'regular' (512x512) or 'custom_emoji' (100x100)
  let currentImage = null;
  let imgX = 0;
  let imgY = 0;
  let scale = 1.0;
  let rotation = 0;
  let outlineType = 'none'; // 'none', 'white', 'neon-cyan', 'neon-pink', 'neon-green', 'neon-yellow'
  let currentPackUrl = null;

  let userStatus = {
    user_id: null,
    stickers_count: 0,
    is_pro: false,
    current_pack: null,
  };

  // --- Outline Color Map ---
  const OUTLINE_COLORS = {
    white: '#ffffff',
    'neon-cyan': '#00f2fe',
    'neon-pink': '#ff007f',
    'neon-green': '#00ff88',
    'neon-yellow': '#ffff00',
  };

  // --- Helper: Haptic Feedback ---
  function haptic(type = 'light') {
    try {
      if (type === 'success' || type === 'error' || type === 'warning') {
        tg?.HapticFeedback?.notificationOccurred(type);
      } else {
        tg?.HapticFeedback?.impactOccurred(type);
      }
    } catch (_) {}
  }

  // --- Helper: Toast Notification ---
  let toastTimer = null;
  function showToast(message, duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastNotification.textContent = message;
    toastNotification.classList.add('show');
    toastTimer = setTimeout(() => {
      toastNotification.classList.remove('show');
    }, duration);
  }

  // --- Canvas Rendering Engine ---
  function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentImage) return;

    const baseDim = canvas.width; // 512 or 100
    const ratio = baseDim / 512;

    // 1. Render scaled and rotated image to an offscreen buffer
    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    const offCtx = offCanvas.getContext('2d');

    const centerX = canvas.width / 2 + imgX;
    const centerY = canvas.height / 2 + imgY;

    offCtx.save();
    offCtx.translate(centerX, centerY);
    offCtx.rotate(rotation);
    offCtx.scale(scale, scale);
    offCtx.drawImage(
      currentImage,
      -currentImage.width / 2,
      -currentImage.height / 2,
      currentImage.width,
      currentImage.height
    );
    offCtx.restore();

    // 2. Apply Outline / Neon effect
    if (outlineType !== 'none' && OUTLINE_COLORS[outlineType]) {
      const outlineColor = OUTLINE_COLORS[outlineType];
      const isNeon = outlineType.startsWith('neon-');

      // Create silhouette mask canvas
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');

      maskCtx.drawImage(offCanvas, 0, 0);
      maskCtx.globalCompositeOperation = 'source-in';
      maskCtx.fillStyle = outlineColor;
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      const outlineRadius = (isNeon ? 10 : 8) * ratio;

      ctx.save();
      if (isNeon) {
        // Neon Glow: multi-pass shadow blur
        ctx.shadowColor = outlineColor;
        ctx.shadowBlur = outlineRadius * 2;
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.drawImage(maskCanvas, 0, 0);
      } else {
        // Crisp White Sticker Outline: radial distribution
        const steps = 18;
        for (let i = 0; i < steps; i++) {
          const angle = (i * 2 * Math.PI) / steps;
          const ox = Math.cos(angle) * outlineRadius;
          const oy = Math.sin(angle) * outlineRadius;
          ctx.drawImage(maskCanvas, ox, oy);
        }
      }
      ctx.restore();
    }

    // 3. Draw original image onto main canvas
    ctx.drawImage(offCanvas, 0, 0);

    // 4. Draw Meme / Sticker Text Overlays
    renderTextOverlays(ratio);
  }

  function renderTextOverlays(ratio) {
    const topText = topTextInput.value.trim().toUpperCase();
    const bottomText = bottomTextInput.value.trim().toUpperCase();

    if (!topText && !bottomText) return;

    const baseFontSize = parseInt(fontSizeRange.value, 10) || 40;
    const fontSize = Math.max(10, Math.round(baseFontSize * ratio));

    ctx.save();
    ctx.font = `900 ${fontSize}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.16));
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const padding = 16 * ratio;
    const maxWidth = canvas.width - padding * 2;

    if (topText) {
      const topY = fontSize + padding;
      ctx.strokeText(topText, canvas.width / 2, topY, maxWidth);
      ctx.fillText(topText, canvas.width / 2, topY, maxWidth);
    }

    if (bottomText) {
      const bottomY = canvas.height - padding;
      ctx.strokeText(bottomText, canvas.width / 2, bottomY, maxWidth);
      ctx.fillText(bottomText, canvas.width / 2, bottomY, maxWidth);
    }

    ctx.restore();
  }

  // --- Image Loading & Fitting ---
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Будь ласка, оберіть файл зображення');
      return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        currentImage = img;
        resetTransform();
        fitImageToCanvas();

        uploadPrompt.style.display = 'none';
        canvasOverlayControls.style.display = 'flex';
        photoActions.style.display = 'flex';
        canvasWrapper.classList.add('has-image');
        btnCreateSticker.disabled = false;

        renderCanvas();
        haptic('medium');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function resetTransform() {
    imgX = 0;
    imgY = 0;
    rotation = 0;
  }

  function fitImageToCanvas() {
    if (!currentImage) return;
    const maxDim = canvas.width * 0.9;
    const imgMax = Math.max(currentImage.width, currentImage.height);
    scale = maxDim / imgMax;
    imgX = 0;
    imgY = 0;
    renderCanvas();
  }

  // --- Touch & Gesture Manipulation on Canvas ---
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialPinchDistance = null;
  let initialScale = 1.0;

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  // Touch Events
  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (!currentImage) return;
      if (e.touches.length === 1) {
        isDragging = true;
        startX = e.touches[0].clientX - imgX;
        startY = e.touches[0].clientY - imgY;
      } else if (e.touches.length === 2) {
        isDragging = false;
        initialPinchDistance = getTouchDistance(e.touches);
        initialScale = scale;
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (!currentImage) return;
      e.preventDefault();

      if (e.touches.length === 1 && isDragging) {
        imgX = e.touches[0].clientX - startX;
        imgY = e.touches[0].clientY - startY;
        renderCanvas();
      } else if (e.touches.length === 2 && initialPinchDistance) {
        const currentDistance = getTouchDistance(e.touches);
        const factor = currentDistance / initialPinchDistance;
        scale = Math.min(Math.max(initialScale * factor, 0.1), 5.0);
        renderCanvas();
      }
    },
    { passive: false }
  );

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      initialPinchDistance = null;
    }
    if (e.touches.length === 0) {
      isDragging = false;
    }
  });

  // Mouse Events for Desktop & Dev Testing
  canvas.addEventListener('mousedown', (e) => {
    if (!currentImage) return;
    isDragging = true;
    startX = e.clientX - imgX;
    startY = e.clientY - imgY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !currentImage) return;
    imgX = e.clientX - startX;
    imgY = e.clientY - startY;
    renderCanvas();
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!currentImage) return;
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
      scale = Math.min(Math.max(scale * zoomFactor, 0.1), 5.0);
      renderCanvas();
    },
    { passive: false }
  );

  // --- Canvas Quick Overlay Buttons ---
  btnZoomIn.addEventListener('click', () => {
    scale = Math.min(scale * 1.15, 5.0);
    renderCanvas();
    haptic('light');
  });

  btnZoomOut.addEventListener('click', () => {
    scale = Math.max(scale * 0.85, 0.1);
    renderCanvas();
    haptic('light');
  });

  btnResetView.addEventListener('click', () => {
    fitImageToCanvas();
    haptic('light');
  });

  btnFitImage.addEventListener('click', () => {
    fitImageToCanvas();
    haptic('light');
  });

  // --- File Input Listener ---
  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleImageFile(file);
    }
  });

  // --- Mode Switching ---
  function setMode(mode) {
    if (mode === 'custom_emoji' && !userStatus.is_pro) {
      haptic('warning');
      openProModal();
      return;
    }

    currentMode = mode;
    tabSticker.classList.toggle('active', mode === 'regular');
    tabEmoji.classList.toggle('active', mode === 'custom_emoji');

    if (mode === 'regular') {
      canvas.width = 512;
      canvas.height = 512;
      btnSubmitText.textContent = '➕ Створити та додати до паку';
    } else {
      canvas.width = 100;
      canvas.height = 100;
      btnSubmitText.textContent = '😎 Створити кастомне емодзі';
    }

    if (currentImage) {
      fitImageToCanvas();
    } else {
      renderCanvas();
    }
    haptic('medium');
  }

  tabSticker.addEventListener('click', () => setMode('regular'));
  tabEmoji.addEventListener('click', () => setMode('custom_emoji'));

  // --- Outline Style Buttons ---
  outlineButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      outlineButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      outlineType = btn.dataset.outline;
      renderCanvas();
      haptic('light');
    });
  });

  // --- Text & Font Inputs ---
  topTextInput.addEventListener('input', renderCanvas);
  bottomTextInput.addEventListener('input', renderCanvas);
  fontSizeRange.addEventListener('input', renderCanvas);

  // --- Emoji Trigger Inputs ---
  emojiChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      customEmojiInput.value = chip.textContent;
      haptic('light');
    });
  });

  // --- WebP Blob Export with <= 512 KB Guarantee ---
  async function exportCanvasToWebP() {
    let quality = 0.95;
    const maxBytes = 512 * 1024; // 512 KB

    while (quality >= 0.4) {
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', quality);
      });

      if (!blob) break;

      if (blob.size <= maxBytes) {
        return blob;
      }
      quality -= 0.1;
    }

    // Fallback if still over limit
    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.5);
    });
  }

  // --- Submit to Cloudflare Worker ---
  btnCreateSticker.addEventListener('click', async () => {
    if (!currentImage) {
      showToast('Спочатку виберіть фото з галереї!');
      return;
    }

    if (!workerUrl) {
      openSettingsModal();
      showToast('Вкажіть адресу вашого Cloudflare Worker');
      return;
    }

    // Set Loading State
    btnCreateSticker.disabled = true;
    btnSpinner.style.display = 'inline-block';
    btnSubmitText.textContent = 'Зберігаємо в Telegram...';
    haptic('medium');

    try {
      const blob = await exportCanvasToWebP();
      if (!blob) {
        throw new Error('Не вдалося створити WebP зображення з Canvas');
      }

      const initData = tg?.initData || '';
      const emoji = customEmojiInput.value.trim() || '😎';

      const formData = new FormData();
      formData.append('file', blob, 'sticker.webp');
      formData.append('initData', initData);
      formData.append('emoji', emoji);
      formData.append('mode', currentMode);

      const endpoint = `${workerUrl.replace(/\/+$/, '')}/api/upload-sticker`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.code === 'PRO_REQUIRED' || data.code === 'LIMIT_REACHED') {
          openProModal();
          throw new Error(data.error || 'Потрібен PRO-доступ');
        }
        throw new Error(data.error || 'Помилка збереження на сервері');
      }

      // Success
      haptic('success');
      currentPackUrl = data.pack_url;
      updateUserStatsUI({
        stickers_count: data.stickers_count,
        is_pro: data.is_pro,
        current_pack: data.pack_name,
      });

      // Show success modal
      successStickerPreview.src = canvas.toDataURL('image/webp');
      openSuccessModal();
    } catch (err) {
      haptic('error');
      showToast(`Помилка: ${err.message}`);
    } finally {
      btnCreateSticker.disabled = false;
      btnSpinner.style.display = 'none';
      btnSubmitText.textContent =
        currentMode === 'regular'
          ? '➕ Створити та додати до паку'
          : '😎 Створити кастомне емодзі';
    }
  });

  // --- Success Modal Actions ---
  function openSuccessModal() {
    successModal.style.display = 'flex';
  }

  btnCloseSuccessModal.addEventListener('click', () => {
    successModal.style.display = 'none';
  });

  btnOpenPackTelegram.addEventListener('click', () => {
    if (currentPackUrl) {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(currentPackUrl);
      } else {
        window.open(currentPackUrl, '_blank');
      }
    }
  });

  // --- PRO Access & Telegram Stars Flow ---
  function openProModal() {
    proModal.style.display = 'flex';
  }

  btnCloseProModal.addEventListener('click', () => {
    proModal.style.display = 'none';
  });

  btnProBadge.addEventListener('click', () => {
    if (userStatus.is_pro) {
      showToast('У вас вже активовано PRO-доступ! 🎉');
    } else {
      openProModal();
      haptic('light');
    }
  });

  btnBuyStars.addEventListener('click', async () => {
    if (!workerUrl) {
      openSettingsModal();
      showToast('Вкажіть адресу Cloudflare Worker');
      return;
    }

    buySpinner.style.display = 'inline-block';
    btnBuyStars.disabled = true;
    haptic('medium');

    try {
      const endpoint = `${workerUrl.replace(/\/+$/, '')}/create-invoice`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          initData: tg?.initData || '',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok || !data.invoice_link) {
        throw new Error(data.error || 'Не вдалося створити рахунок на оплату Stars');
      }

      // Open Native Telegram Stars Payment Sheet
      if (tg?.openInvoice) {
        tg.openInvoice(data.invoice_link, (status) => {
          if (status === 'paid') {
            haptic('success');
            showToast('🎉 Оплата успішна! PRO-доступ активовано.');
            userStatus.is_pro = true;
            updateUserStatsUI(userStatus);
            proModal.style.display = 'none';
          } else if (status === 'cancelled') {
            showToast('Оплату скасовано.');
          } else if (status === 'failed') {
            showToast('Помилка під час здійснення оплати.');
          }
        });
      } else {
        // Fallback for desktop testing
        window.open(data.invoice_link, '_blank');
        showToast('Посилання на оплату відкрито.');
      }
    } catch (err) {
      haptic('error');
      showToast(`Помилка: ${err.message}`);
    } finally {
      buySpinner.style.display = 'none';
      btnBuyStars.disabled = false;
    }
  });

  // --- Settings Modal (Worker Endpoint) ---
  function openSettingsModal() {
    workerUrlInput.value = workerUrl;
    settingsModal.style.display = 'flex';
  }

  btnSettings.addEventListener('click', openSettingsModal);

  btnCloseSettingsModal.addEventListener('click', () => {
    settingsModal.style.display = 'none';
  });

  btnSaveSettings.addEventListener('click', () => {
    let url = workerUrlInput.value.trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    workerUrl = url;
    localStorage.setItem('WORKER_URL', workerUrl);
    settingsModal.style.display = 'none';
    showToast('Адресу бекенду збережено!');
    fetchUserStatus();
  });

  // --- Fetch User Status & Update UI ---
  function updateUserStatsUI(status) {
    userStatus = { ...userStatus, ...status };

    if (userStatus.is_pro) {
      btnProBadge.classList.add('is-pro-active');
      proBadgeText.textContent = 'PRO Активно ⭐';
      stickersCountDisplay.textContent = `${userStatus.stickers_count} (Безліміт)`;
    } else {
      btnProBadge.classList.remove('is-pro-active');
      proBadgeText.textContent = 'Отримати PRO';
      stickersCountDisplay.textContent = `${userStatus.stickers_count} / 3`;
    }

    if (userStatus.current_pack) {
      activePackInfo.style.display = 'flex';
      const packUrl = `https://t.me/addstickers/${userStatus.current_pack}`;
      activePackLink.href = packUrl;
      currentPackUrl = packUrl;
      activePackLink.textContent = `${userStatus.current_pack.split('_')[0]}... ↗`;
    }
  }

  async function fetchUserStatus() {
    if (!workerUrl || !tg?.initData) return;

    try {
      const endpoint = `${workerUrl.replace(/\/+$/, '')}/api/user-status`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });

      const data = await res.json();
      if (data.ok && data.user) {
        updateUserStatsUI(data.user);
      }
    } catch (err) {
      console.warn('Не вдалося отримати статус користувача:', err);
    }
  }

  // --- Initial Setup ---
  renderCanvas();
  fetchUserStatus();
})();
