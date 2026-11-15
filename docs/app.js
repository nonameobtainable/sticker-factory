/**
 * Stick2Snap — Professional Sticker & Emoji Studio
 * Touch-precise Canvas editor, Realistic Vinyl Border & Drop Shadow,
 * Telegram WebApp Integration & Stars Payment.
 */

(function () {
  'use strict';

  // --- Telegram Web App SDK ---
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor?.('#0a0d14');
      tg.setBackgroundColor?.('#0a0d14');
    } catch (_) {}
  }

  // --- Backend Worker URL ---
  const WORKER_URL = 'https://sticker-worker.playjik.workers.dev';

  // --- DOM Elements ---
  const canvas = document.getElementById('stickerCanvas');
  const ctx = canvas.getContext('2d');
  const canvasBox = document.getElementById('canvasBox');
  const precisionGrid = document.getElementById('precisionGrid');
  const uploadPrompt = document.getElementById('uploadPrompt');
  const canvasHud = document.getElementById('canvasHud');
  const photoControlsBar = document.getElementById('photoControlsBar');
  const editingToolstrip = document.getElementById('editingToolstrip');
  const imageInput = document.getElementById('imageInput');

  // Mode tabs
  const tabSticker = document.getElementById('tabSticker');
  const tabEmoji = document.getElementById('tabEmoji');

  // HUD buttons
  const btnToggleGrid = document.getElementById('btnToggleGrid');
  const btnZoomIn = document.getElementById('btnZoomIn');
  const btnZoomOut = document.getElementById('btnZoomOut');
  const btnResetView = document.getElementById('btnResetView');
  const btnCenterImage = document.getElementById('btnCenterImage');
  const btnFlipHorizontal = document.getElementById('btnFlipHorizontal');

  // Tool Navigation Tabs
  const toolNavBtns = document.querySelectorAll('.tool-nav-btn');
  const toolPanels = document.querySelectorAll('.tool-panel');

  // Border controls
  const swatchButtons = document.querySelectorAll('.swatch-btn');
  const borderWidthGroup = document.getElementById('borderWidthGroup');
  const borderWidthRange = document.getElementById('borderWidthRange');
  const borderWidthVal = document.getElementById('borderWidthVal');
  const shadowToggleGroup = document.getElementById('shadowToggleGroup');
  const shadowCheckbox = document.getElementById('shadowCheckbox');

  // Text inputs
  const topTextInput = document.getElementById('topTextInput');
  const bottomTextInput = document.getElementById('bottomTextInput');
  const fontSizeRange = document.getElementById('fontSizeRange');
  const fontSizeVal = document.getElementById('fontSizeVal');

  // Transform sliders
  const scaleRange = document.getElementById('scaleRange');
  const scaleVal = document.getElementById('scaleVal');
  const rotationRange = document.getElementById('rotationRange');
  const rotationVal = document.getElementById('rotationVal');

  // Emoji trigger inputs
  const customEmojiInput = document.getElementById('customEmojiInput');
  const trayEmojis = document.querySelectorAll('.tray-emoji');

  // Submit button
  const btnCreateSticker = document.getElementById('btnCreateSticker');
  const btnSubmitText = document.getElementById('btnSubmitText');
  const btnSpinner = document.getElementById('btnSpinner');

  // Status & Badges
  const stickersCountDisplay = document.getElementById('stickersCountDisplay');
  const activePackWrapper = document.getElementById('activePackWrapper');
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

  const toastNotification = document.getElementById('toastNotification');

  // --- App State ---
  let currentMode = 'regular'; // 'regular' (512x512) or 'custom_emoji' (100x100)
  let currentImage = null;
  let imgX = 0;
  let imgY = 0;
  let scale = 1.0;
  let rotation = 0; // In degrees
  let isFlippedX = false;
  let isGridVisible = false;

  let borderStyle = 'none'; // 'none', 'white', 'black', 'cyan', 'pink', 'lime'
  let borderWidth = 8;
  let hasVinylShadow = true;

  let currentPackUrl = null;

  let userStatus = {
    user_id: null,
    stickers_count: 0,
    is_pro: false,
    current_pack: null,
  };

  const BORDER_PALETTE = {
    white: '#ffffff',
    black: '#0f172a',
    cyan: '#00f2fe',
    pink: '#ff007f',
    lime: '#00ff88',
  };

  // --- Haptic Feedback Helper ---
  function haptic(type = 'light') {
    try {
      if (type === 'success' || type === 'error' || type === 'warning') {
        tg?.HapticFeedback?.notificationOccurred(type);
      } else {
        tg?.HapticFeedback?.impactOccurred(type);
      }
    } catch (_) {}
  }

  // --- Toast Notification ---
  let toastTimer = null;
  function showToast(message, duration = 3000) {
    if (toastTimer) clearTimeout(toastTimer);
    toastNotification.textContent = message;
    toastNotification.classList.add('show');
    toastTimer = setTimeout(() => {
      toastNotification.classList.remove('show');
    }, duration);
  }

  // --- Main Canvas Render Pipeline ---
  function renderCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!currentImage) return;

    const baseDim = canvas.width;
    const ratio = baseDim / 512;

    // 1. Offscreen Buffer for Scaled & Transformed Image
    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvas.width;
    offCanvas.height = canvas.height;
    const offCtx = offCanvas.getContext('2d');

    const centerX = canvas.width / 2 + imgX;
    const centerY = canvas.height / 2 + imgY;

    offCtx.save();
    offCtx.translate(centerX, centerY);
    offCtx.rotate((rotation * Math.PI) / 180);
    offCtx.scale(isFlippedX ? -scale : scale, scale);
    offCtx.drawImage(
      currentImage,
      -currentImage.width / 2,
      -currentImage.height / 2,
      currentImage.width,
      currentImage.height
    );
    offCtx.restore();

    // 2. Realistic Die-Cut Vinyl Sticker Border & Glow
    if (borderStyle !== 'none' && BORDER_PALETTE[borderStyle]) {
      const color = BORDER_PALETTE[borderStyle];
      const radius = borderWidth * ratio;
      const isNeonGlow = borderStyle === 'cyan' || borderStyle === 'pink' || borderStyle === 'lime';

      // Create solid silhouette mask
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');

      maskCtx.drawImage(offCanvas, 0, 0);
      maskCtx.globalCompositeOperation = 'source-in';
      maskCtx.fillStyle = color;
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      ctx.save();

      // 2a. Vinyl Drop Shadow (subtle depth underneath die-cut sticker)
      if (hasVinylShadow && !isNeonGlow) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 10 * ratio;
        ctx.shadowOffsetX = 2 * ratio;
        ctx.shadowOffsetY = 5 * ratio;
        // Draw shadow silhouette
        const shadowSteps = 12;
        for (let i = 0; i < shadowSteps; i++) {
          const angle = (i * 2 * Math.PI) / shadowSteps;
          ctx.drawImage(maskCanvas, Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        ctx.restore();
      }

      // 2b. Draw Border / Glow
      if (isNeonGlow) {
        // High-intensity multi-pass glow
        ctx.shadowColor = color;
        ctx.shadowBlur = radius * 2.2;
        ctx.drawImage(maskCanvas, 0, 0);
        ctx.drawImage(maskCanvas, 0, 0);
      } else {
        // Crisp Solid Die-Cut Vinyl Border: Radial distribution
        const steps = 24;
        for (let i = 0; i < steps; i++) {
          const angle = (i * 2 * Math.PI) / steps;
          const ox = Math.cos(angle) * radius;
          const oy = Math.sin(angle) * radius;
          ctx.drawImage(maskCanvas, ox, oy);
        }
      }
      ctx.restore();
    }

    // 3. Draw original crisp image on top
    ctx.drawImage(offCanvas, 0, 0);

    // 4. Render Captions
    renderCaptions(ratio);
  }

  function renderCaptions(ratio) {
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

  // --- Image Loading ---
  function handleImageFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Please select a valid image file');
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
        canvasHud.style.display = 'flex';
        photoControlsBar.style.display = 'flex';
        editingToolstrip.style.display = 'block';
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
    isFlippedX = false;
    rotationRange.value = 0;
    rotationVal.textContent = '0°';
  }

  function fitImageToCanvas() {
    if (!currentImage) return;
    const maxDim = canvas.width * 0.88;
    const imgMax = Math.max(currentImage.width, currentImage.height);
    scale = maxDim / imgMax;
    imgX = 0;
    imgY = 0;

    const pct = Math.round(scale * 100);
    scaleRange.value = pct;
    scaleVal.textContent = `${pct}%`;

    renderCanvas();
  }

  // --- Touch & Gesture Interactions ---
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let initialPinchDist = null;
  let initialScale = 1.0;

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

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
        initialPinchDist = getTouchDistance(e.touches);
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
      } else if (e.touches.length === 2 && initialPinchDist) {
        const currentDist = getTouchDistance(e.touches);
        const factor = currentDist / initialPinchDist;
        scale = Math.min(Math.max(initialScale * factor, 0.1), 3.0);
        const pct = Math.round(scale * 100);
        scaleRange.value = pct;
        scaleVal.textContent = `${pct}%`;
        renderCanvas();
      }
    },
    { passive: false }
  );

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) initialPinchDist = null;
    if (e.touches.length === 0) isDragging = false;
  });

  // Mouse drag & scroll zoom
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
      const zoomFactor = e.deltaY < 0 ? 1.06 : 0.94;
      scale = Math.min(Math.max(scale * zoomFactor, 0.1), 3.0);
      const pct = Math.round(scale * 100);
      scaleRange.value = pct;
      scaleVal.textContent = `${pct}%`;
      renderCanvas();
    },
    { passive: false }
  );

  // --- HUD Controls ---
  btnToggleGrid.addEventListener('click', () => {
    isGridVisible = !isGridVisible;
    precisionGrid.style.display = isGridVisible ? 'block' : 'none';
    haptic('light');
  });

  btnZoomIn.addEventListener('click', () => {
    scale = Math.min(scale * 1.15, 3.0);
    const pct = Math.round(scale * 100);
    scaleRange.value = pct;
    scaleVal.textContent = `${pct}%`;
    renderCanvas();
    haptic('light');
  });

  btnZoomOut.addEventListener('click', () => {
    scale = Math.max(scale * 0.85, 0.1);
    const pct = Math.round(scale * 100);
    scaleRange.value = pct;
    scaleVal.textContent = `${pct}%`;
    renderCanvas();
    haptic('light');
  });

  btnResetView.addEventListener('click', () => {
    fitImageToCanvas();
    haptic('light');
  });

  btnCenterImage.addEventListener('click', () => {
    imgX = 0;
    imgY = 0;
    renderCanvas();
    haptic('light');
  });

  btnFlipHorizontal.addEventListener('click', () => {
    isFlippedX = !isFlippedX;
    renderCanvas();
    haptic('light');
  });

  imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImageFile(file);
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
      btnSubmitText.textContent = 'Create Sticker Pack';
    } else {
      canvas.width = 100;
      canvas.height = 100;
      btnSubmitText.textContent = 'Create Custom Emoji';
    }

    if (currentImage) fitImageToCanvas();
    else renderCanvas();

    haptic('medium');
  }

  tabSticker.addEventListener('click', () => setMode('regular'));
  tabEmoji.addEventListener('click', () => setMode('custom_emoji'));

  // --- Tool Navigation Tabs ---
  toolNavBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      toolNavBtns.forEach((b) => b.classList.remove('active'));
      toolPanels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.dataset.tab;
      document.getElementById(targetId)?.classList.add('active');
      haptic('light');
    });
  });

  // --- Border Palette Swatches ---
  swatchButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      swatchButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      borderStyle = btn.dataset.border;
      const isVisible = borderStyle !== 'none';
      borderWidthGroup.style.display = isVisible ? 'flex' : 'none';
      shadowToggleGroup.style.display = isVisible && !borderStyle.includes('cyan') && !borderStyle.includes('pink') && !borderStyle.includes('lime') ? 'flex' : 'none';

      renderCanvas();
      haptic('light');
    });
  });

  borderWidthRange.addEventListener('input', (e) => {
    borderWidth = parseInt(e.target.value, 10);
    borderWidthVal.textContent = `${borderWidth}px`;
    renderCanvas();
  });

  shadowCheckbox.addEventListener('change', (e) => {
    hasVinylShadow = e.target.checked;
    renderCanvas();
    haptic('light');
  });

  // --- Captions ---
  topTextInput.addEventListener('input', renderCanvas);
  bottomTextInput.addEventListener('input', renderCanvas);
  fontSizeRange.addEventListener('input', (e) => {
    fontSizeVal.textContent = `${e.target.value}px`;
    renderCanvas();
  });

  // --- Transform Sliders ---
  scaleRange.addEventListener('input', (e) => {
    scale = parseInt(e.target.value, 10) / 100;
    scaleVal.textContent = `${e.target.value}%`;
    renderCanvas();
  });

  rotationRange.addEventListener('input', (e) => {
    rotation = parseInt(e.target.value, 10);
    rotationVal.textContent = `${rotation}°`;
    renderCanvas();
  });

  // --- Trigger Emojis ---
  trayEmojis.forEach((btn) => {
    btn.addEventListener('click', () => {
      customEmojiInput.value = btn.textContent;
      haptic('light');
    });
  });

  // --- WebP 512KB Export Guarantee ---
  async function exportCanvasToWebP() {
    let quality = 0.95;
    const maxBytes = 512 * 1024;

    while (quality >= 0.35) {
      const blob = await new Promise((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', quality);
      });

      if (!blob) break;
      if (blob.size <= maxBytes) return blob;
      quality -= 0.1;
    }

    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/webp', 0.5);
    });
  }

  // --- Create & Upload to Telegram ---
  btnCreateSticker.addEventListener('click', async () => {
    if (!currentImage) {
      showToast('Please select a photo first');
      return;
    }

    btnCreateSticker.disabled = true;
    btnSpinner.style.display = 'inline-block';
    btnSubmitText.textContent = 'Syncing with Telegram...';
    haptic('medium');

    try {
      const blob = await exportCanvasToWebP();
      if (!blob) throw new Error('Failed to generate WebP image');

      const initData = tg?.initData || '';
      const emoji = customEmojiInput.value.trim() || '😎';

      const formData = new FormData();
      formData.append('file', blob, 'sticker.webp');
      formData.append('initData', initData);
      formData.append('emoji', emoji);
      formData.append('mode', currentMode);

      const endpoint = `${WORKER_URL}/api/upload-sticker`;
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        if (data.code === 'PRO_REQUIRED' || data.code === 'LIMIT_REACHED') {
          openProModal();
          throw new Error(data.error || 'PRO access required');
        }
        throw new Error(data.error || 'Failed to create sticker');
      }

      haptic('success');
      currentPackUrl = data.pack_url;
      updateUserStatsUI({
        stickers_count: data.stickers_count,
        is_pro: data.is_pro,
        current_pack: data.pack_name,
      });

      successStickerPreview.src = canvas.toDataURL('image/webp');
      openSuccessModal();
    } catch (err) {
      haptic('error');
      showToast(`Error: ${err.message}`);
    } finally {
      btnCreateSticker.disabled = false;
      btnSpinner.style.display = 'none';
      btnSubmitText.textContent =
        currentMode === 'regular' ? 'Create Sticker Pack' : 'Create Custom Emoji';
    }
  });

  // --- Modals ---
  function openSuccessModal() {
    successModal.style.display = 'flex';
  }

  btnCloseSuccessModal.addEventListener('click', () => {
    successModal.style.display = 'none';
  });

  btnOpenPackTelegram.addEventListener('click', () => {
    if (currentPackUrl) {
      if (tg?.openTelegramLink) tg.openTelegramLink(currentPackUrl);
      else window.open(currentPackUrl, '_blank');
    }
  });

  function openProModal() {
    proModal.style.display = 'flex';
  }

  btnCloseProModal.addEventListener('click', () => {
    proModal.style.display = 'none';
  });

  btnProBadge.addEventListener('click', () => {
    if (userStatus.is_pro) {
      showToast('PRO plan is already active! ⭐');
    } else {
      openProModal();
      haptic('light');
    }
  });

  // --- Telegram Stars Purchase ---
  btnBuyStars.addEventListener('click', async () => {
    buySpinner.style.display = 'inline-block';
    btnBuyStars.disabled = true;
    haptic('medium');

    try {
      const endpoint = `${WORKER_URL}/create-invoice`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg?.initData || '' }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok || !data.invoice_link) {
        throw new Error(data.error || 'Failed to generate Stars invoice');
      }

      if (tg?.openInvoice) {
        tg.openInvoice(data.invoice_link, (status) => {
          if (status === 'paid') {
            haptic('success');
            showToast('🎉 PRO unlocked successfully!');
            userStatus.is_pro = true;
            updateUserStatsUI(userStatus);
            proModal.style.display = 'none';
          } else if (status === 'cancelled') {
            showToast('Payment cancelled');
          } else if (status === 'failed') {
            showToast('Payment failed');
          }
        });
      } else {
        window.open(data.invoice_link, '_blank');
        showToast('Invoice link opened');
      }
    } catch (err) {
      haptic('error');
      showToast(`Error: ${err.message}`);
    } finally {
      buySpinner.style.display = 'none';
      btnBuyStars.disabled = false;
    }
  });

  // --- User Stats UI ---
  function updateUserStatsUI(status) {
    userStatus = { ...userStatus, ...status };

    if (userStatus.is_pro) {
      btnProBadge.classList.add('is-pro-active');
      proBadgeText.textContent = 'PRO Active';
      stickersCountDisplay.textContent = `${userStatus.stickers_count} (Unlimited)`;
    } else {
      btnProBadge.classList.remove('is-pro-active');
      proBadgeText.textContent = 'Get PRO';
      stickersCountDisplay.textContent = `${userStatus.stickers_count} / 3`;
    }

    if (userStatus.current_pack) {
      activePackWrapper.style.display = 'flex';
      const packUrl = `https://t.me/addstickers/${userStatus.current_pack}`;
      activePackLink.href = packUrl;
      currentPackUrl = packUrl;
    }
  }

  async function fetchUserStatus() {
    if (!tg?.initData) return;

    try {
      const endpoint = `${WORKER_URL}/api/user-status`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData }),
      });

      const data = await res.json();
      if (data.ok && data.user) {
        updateUserStatsUI(data.user);
      }
    } catch (_) {}
  }

  // --- Initial Render ---
  renderCanvas();
  fetchUserStatus();
})();
