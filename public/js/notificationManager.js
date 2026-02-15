/**
 * Notification manager - Sound + Popup alerts for good BIN flips.
 * Uses Web Audio API for beep sounds (no audio file needed).
 * Browser AudioContext requires user interaction to start.
 * Includes sellability and volume gates for filtering.
 */
const NotificationManager = (() => {
  let audioCtx = null;
  const seenFlipUuids = new Set();
  let enabled = false;
  let minProfit = 500000;
  let minPercent = 20;
  let dismissSeconds = 10;
  let soundEnabled = true;
  let minSellability = 30; // 0-100
  let requireSalesVolume = true;

  /**
   * Initialize the notification manager.
   * AudioContext is created on first user click (browser policy).
   */
  function init() {
    loadSettings();

    // Create AudioContext on first user interaction
    document.addEventListener('click', initAudioContext, { once: true });
    document.addEventListener('keydown', initAudioContext, { once: true });
  }

  function initAudioContext() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        console.warn('[Notifications] AudioContext not available');
      }
    }
  }

  function loadSettings() {
    try {
      const s = Settings.get();
      if (s.notifications) {
        enabled = !!s.notifications.enabled;
        minProfit = s.notifications.minProfit ?? 500000;
        minPercent = s.notifications.minPercent ?? 20;
        dismissSeconds = s.notifications.dismissSeconds ?? 10;
        soundEnabled = s.notifications.soundEnabled !== false;
        minSellability = s.notifications.minSellability ?? 30;
        requireSalesVolume = s.notifications.requireSalesVolume !== false;
      }
    } catch {
      // Use defaults
    }
  }

  function saveSettings() {
    const s = Settings.get();
    s.notifications = {
      enabled,
      minProfit,
      minPercent,
      dismissSeconds,
      soundEnabled,
      minSellability,
      requireSalesVolume,
    };
    Settings.save();
  }

  // --- Getters/Setters ---
  function isEnabled() { return enabled; }
  function setEnabled(val) { enabled = val; saveSettings(); }
  function getMinProfit() { return minProfit; }
  function setMinProfit(val) { minProfit = val; saveSettings(); }
  function getMinPercent() { return minPercent; }
  function setMinPercent(val) { minPercent = val; saveSettings(); }
  function getDismissSeconds() { return dismissSeconds; }
  function setDismissSeconds(val) { dismissSeconds = val; saveSettings(); }
  function isSoundEnabled() { return soundEnabled; }
  function setSoundEnabled(val) { soundEnabled = val; saveSettings(); }
  function getMinSellability() { return minSellability; }
  function setMinSellability(val) { minSellability = val; saveSettings(); }
  function isRequireSalesVolume() { return requireSalesVolume; }
  function setRequireSalesVolume(val) { requireSalesVolume = val; saveSettings(); }

  /**
   * Play a beep using Web Audio API.
   */
  function playBeep(freq = 880, ms = 250) {
    if (!audioCtx || !soundEnabled) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(audioCtx.currentTime + ms / 1000);
    } catch {
      // Audio playback failed
    }
  }

  /**
   * Check AH flips against notification thresholds.
   * Shows popup and plays sound for qualifying new flips.
   * Gate 1: profit >= minProfit && percent >= minPercent
   * Gate 2: sellabilityScore >= minSellability/100
   * Gate 3: dailySales >= 1 if requireSalesVolume is active
   * Gate 4: confidenceLabel !== 'VERY_LOW'
   */
  function checkFlips(ahFlips) {
    if (!enabled || !ahFlips || ahFlips.length === 0) return;

    loadSettings(); // Reload in case settings changed

    const sellabilityThreshold = minSellability / 100;

    for (const flip of ahFlips) {
      if (seenFlipUuids.has(flip.uuid)) continue;
      seenFlipUuids.add(flip.uuid);

      // Gate 1: Profit thresholds
      const profit = flip.netProfit || 0;
      const percent = flip.profitPercent || 0;
      if (profit < minProfit || percent < minPercent) continue;

      // Gate 2: Sellability threshold
      const sellScore = flip.sellabilityScore || 0;
      if (sellScore < sellabilityThreshold) continue;

      // Gate 3: Sales volume requirement
      if (requireSalesVolume) {
        const sales = flip.dailySales || 0;
        if (sales < 1) continue;
      }

      // Gate 4: Confidence must not be VERY_LOW
      if (flip.confidenceLabel === 'VERY_LOW') continue;

      showPopup(flip);
      playBeep(880, 250);
    }

    // Cleanup old UUIDs (keep last 500)
    if (seenFlipUuids.size > 1000) {
      const arr = [...seenFlipUuids];
      seenFlipUuids.clear();
      for (let i = arr.length - 500; i < arr.length; i++) {
        seenFlipUuids.add(arr[i]);
      }
    }
  }

  /**
   * Show a notification popup overlay for a flip.
   */
  function showPopup(flip) {
    const overlay = document.createElement('div');
    overlay.className = 'notification-popup';

    const profitStr = NumberFormat.short(flip.netProfit);
    const percentStr = NumberFormat.percent(flip.profitPercent);
    const buyStr = NumberFormat.short(flip.buyPrice);
    const sellStr = NumberFormat.short(flip.lowestBin);
    const cmd = `/viewauction ${flip.uuid}`;

    // Confidence label
    const confLabel = flip.confidenceLabel || 'VERY_LOW';
    const confClass = confLabel === 'HIGH' ? 'notif-conf-high'
      : confLabel === 'MEDIUM' ? 'notif-conf-medium' : 'notif-conf-low';
    const dailySales = flip.dailySales || 0;

    overlay.innerHTML = `
      <div class="notif-header">
        <span class="notif-title">Flip gefunden!</span>
        <button class="notif-close">&times;</button>
      </div>
      <div class="notif-body">
        <div class="notif-item">${escapeHtml(flip.itemName)}</div>
        <div class="notif-confidence">
          <span class="${confClass}">[${confLabel}]</span>
          <span>Vol: ${dailySales}/day</span>
        </div>
        <div class="notif-details">
          <span>Kauf: ${buyStr}</span>
          <span>Verkauf: ${sellStr}</span>
        </div>
        <div class="notif-profit">Profit: ${profitStr} (${percentStr})</div>
        <div class="notif-cmd" title="Klick zum Kopieren">${escapeHtml(cmd)}</div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Dismiss button
    overlay.querySelector('.notif-close').addEventListener('click', () => {
      overlay.remove();
    });

    // Click command to copy
    overlay.querySelector('.notif-cmd').addEventListener('click', () => {
      navigator.clipboard.writeText(cmd).catch(() => {});
      overlay.querySelector('.notif-cmd').textContent = 'Kopiert!';
    });

    // Auto-dismiss
    if (dismissSeconds > 0) {
      setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
      }, dismissSeconds * 1000);
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init,
    checkFlips,
    isEnabled, setEnabled,
    getMinProfit, setMinProfit,
    getMinPercent, setMinPercent,
    getDismissSeconds, setDismissSeconds,
    isSoundEnabled, setSoundEnabled,
    getMinSellability, setMinSellability,
    isRequireSalesVolume, setRequireSalesVolume,
    loadSettings,
  };
})();
