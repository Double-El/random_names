/* eslint-disable no-alert */
(() => {
  const STORAGE_KEY = "officeDinner.randomNameGame.v1";

  /** @typedef {{ names: string[], noRepeat: boolean, sound: boolean, remaining: string[], history: string[] }} State */

  const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

  const el = {
    namesInput: /** @type {HTMLTextAreaElement} */ ($("namesInput")),
    btnSave: $("btnSave"),
    btnClearInput: $("btnClearInput"),
    btnDraw: $("btnDraw"),
    btnUndo: $("btnUndo"),
    btnResetDraw: $("btnResetDraw"),
    btnResetAll: $("btnResetAll"),
    btnShare: $("btnShare"),
    chkNoRepeat: /** @type {HTMLInputElement} */ ($("chkNoRepeat")),
    chkSound: /** @type {HTMLInputElement} */ ($("chkSound")),
    drawResult: $("drawResult"),
    drawMeta: $("drawMeta"),
    countPill: $("countPill"),
    remainingCount: $("remainingCount"),
    historyList: $("historyList"),
    historyEmpty: $("historyEmpty"),
  };

  /** @returns {State} */
  function defaultState() {
    return {
      names: [],
      noRepeat: true,
      sound: false,
      remaining: [],
      history: [],
    };
  }

  /** @returns {State} */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      const s = defaultState();
      if (Array.isArray(parsed.names)) s.names = parsed.names.filter((x) => typeof x === "string");
      if (typeof parsed.noRepeat === "boolean") s.noRepeat = parsed.noRepeat;
      if (typeof parsed.sound === "boolean") s.sound = parsed.sound;
      if (Array.isArray(parsed.remaining))
        s.remaining = parsed.remaining.filter((x) => typeof x === "string");
      if (Array.isArray(parsed.history))
        s.history = parsed.history.filter((x) => typeof x === "string");
      // Defensive: keep remaining/history consistent if names changed.
      s.names = normalizeNames(s.names);
      s.remaining = normalizeNames(s.remaining).filter((n) => s.names.includes(n));
      s.history = normalizeNames(s.history).filter((n) => s.names.includes(n));
      return s;
    } catch {
      return defaultState();
    }
  }

  /** @param {State} state */
  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  /** @param {string[]} names */
  function normalizeNames(names) {
    const seen = new Set();
    const out = [];
    for (const raw of names) {
      const n = String(raw).replace(/\s+/g, " ").trim();
      if (!n) continue;
      if (seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  }

  /** @param {string} text */
  function parseNames(text) {
    const replaced = text.replace(/\r\n/g, "\n");
    const parts = replaced
      .split(/[\n,]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    return normalizeNames(parts);
  }

  /** @param {number} min @param {number} max */
  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /** @template T @param {T[]} arr */
  function pickOne(arr) {
    return arr[randInt(0, arr.length - 1)];
  }

  /**
   * Simple tick sound (no external assets).
   * @param {number} frequency
   * @param {number} durationMs
   * @param {number} volume
   */
  function beep(frequency = 880, durationMs = 20, volume = 0.06) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = frequency;
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      setTimeout(() => {
        osc.stop();
        ctx.close().catch(() => {});
      }, durationMs);
    } catch {
      // ignore
    }
  }

  /** @param {HTMLElement} node */
  function pulseShake(node) {
    node.classList.remove("shake");
    // Force reflow
    void node.offsetWidth;
    node.classList.add("shake");
  }

  let state = loadState();

  /** @type {number | null} */
  let drawTimer = null;
  /** @type {number | null} */
  let drawStopper = null;
  let isDrawing = false;

  function computeRemainingBase() {
    if (!state.noRepeat) return state.names.slice();
    const used = new Set(state.history);
    return state.names.filter((n) => !used.has(n));
  }

  function ensureRemaining() {
    const base = computeRemainingBase();
    if (!state.noRepeat) {
      state.remaining = base;
      return;
    }
    // In noRepeat mode, remaining should be base minus whatever already in remaining? We keep base.
    state.remaining = base;
  }

  function updateCounts() {
    el.countPill.textContent = `${state.names.length}명`;
    el.remainingCount.textContent = String(state.noRepeat ? state.remaining.length : state.names.length);
  }

  function renderHistory() {
    el.historyList.innerHTML = "";
    if (!state.history.length) {
      el.historyEmpty.style.display = "block";
      return;
    }
    el.historyEmpty.style.display = "none";
    state.history.forEach((name, idx) => {
      const li = document.createElement("li");
      li.textContent = `${name}`;
      li.title = `#${idx + 1}`;
      el.historyList.appendChild(li);
    });
  }

  function updateDrawMeta() {
    if (!state.names.length) {
      el.drawMeta.textContent = "이름을 저장한 뒤 시작하세요.";
      return;
    }
    if (state.noRepeat) {
      if (!state.remaining.length) {
        el.drawMeta.textContent = "모두 한 번씩 뽑았습니다. 설명: 뽑기 초기화를 누르면 다시 시작합니다.";
      } else {
        el.drawMeta.textContent = "중복 없이 진행 중입니다.";
      }
    } else {
      el.drawMeta.textContent = "중복 허용 모드입니다.";
    }
  }

  function syncUIFromState() {
    el.chkNoRepeat.checked = state.noRepeat;
    el.chkSound.checked = state.sound;
    updateCounts();
    renderHistory();
    updateDrawMeta();
    el.btnUndo.setAttribute("aria-disabled", String(state.history.length === 0));
    el.btnUndo.disabled = state.history.length === 0 || isDrawing;
    el.btnDraw.disabled = !state.names.length || isDrawing || (state.noRepeat && state.remaining.length === 0);
    el.btnResetDraw.disabled = !state.names.length || isDrawing;
  }

  function stopAnimation() {
    if (drawTimer != null) {
      clearInterval(drawTimer);
      drawTimer = null;
    }
    if (drawStopper != null) {
      clearTimeout(drawStopper);
      drawStopper = null;
    }
    isDrawing = false;
  }

  function resetDrawOnly() {
    stopAnimation();
    state.history = [];
    ensureRemaining();
    saveState(state);
    el.drawResult.textContent = "—";
    pulseShake(el.drawResult);
    syncUIFromState();
  }

  function hardReset() {
    stopAnimation();
    state = defaultState();
    saveState(state);
    el.namesInput.value = "";
    el.drawResult.textContent = "—";
    pulseShake(el.drawResult);
    syncUIFromState();
  }

  function onSaveNames() {
    const names = parseNames(el.namesInput.value);
    if (names.length < 2) {
      alert("이름을 2명 이상 입력해주세요. (줄바꿈 또는 쉼표로 구분)");
      pulseShake(el.drawResult);
      return;
    }

    state.names = names;
    state.history = [];
    ensureRemaining();
    saveState(state);
    el.drawResult.textContent = "—";
    syncUIFromState();
  }

  function setNoRepeat(checked) {
    state.noRepeat = checked;
    // When toggling, we keep history but recompute remaining accordingly.
    ensureRemaining();
    saveState(state);
    syncUIFromState();
  }

  function setSound(checked) {
    state.sound = checked;
    saveState(state);
    syncUIFromState();
  }

  async function shareLink() {
    try {
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      el.btnShare.textContent = "복사됨!";
      setTimeout(() => (el.btnShare.textContent = "링크 복사"), 900);
    } catch {
      alert("이 브라우저에서는 자동 복사가 제한될 수 있어요. 주소창의 링크를 복사해주세요.");
    }
  }

  function applyWinner(winner) {
    el.drawResult.textContent = winner;
    pulseShake(el.drawResult);

    state.history = [...state.history, winner];
    if (state.noRepeat) {
      state.remaining = state.remaining.filter((n) => n !== winner);
    }
    saveState(state);
    syncUIFromState();
  }

  function startDraw() {
    if (isDrawing) return;
    if (!state.names.length) return;

    if (state.noRepeat && state.remaining.length === 0) {
      pulseShake(el.drawResult);
      return;
    }

    isDrawing = true;
    syncUIFromState();

    const pool = state.noRepeat ? state.remaining : state.names;
    const totalMs = randInt(1400, 2100);
    const tickMs = randInt(45, 70);
    const start = Date.now();

    // Quick cycling animation.
    drawTimer = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / totalMs);
      const current = pickOne(pool);
      el.drawResult.textContent = current;
      if (state.sound) {
        const f = 520 + Math.floor(420 * t);
        beep(f, 18, 0.04);
      }
    }, tickMs);

    drawStopper = window.setTimeout(() => {
      stopAnimation();
      const winner = pickOne(pool);
      applyWinner(winner);
    }, totalMs);
  }

  function undo() {
    if (!state.history.length || isDrawing) return;
    const last = state.history[state.history.length - 1];
    state.history = state.history.slice(0, -1);
    if (state.noRepeat) {
      // Put back to remaining (front)
      if (!state.remaining.includes(last) && state.names.includes(last)) {
        state.remaining = [last, ...state.remaining];
      }
    }
    saveState(state);
    el.drawResult.textContent = state.history.length ? state.history[state.history.length - 1] : "—";
    syncUIFromState();
  }

  // Wire events
  el.btnSave.addEventListener("click", onSaveNames);
  el.btnClearInput.addEventListener("click", () => {
    el.namesInput.value = "";
    el.namesInput.focus();
  });
  el.btnDraw.addEventListener("click", startDraw);
  el.btnUndo.addEventListener("click", undo);
  el.btnResetDraw.addEventListener("click", resetDrawOnly);
  el.btnResetAll.addEventListener("click", () => {
    if (!confirm("정말 전체 초기화할까요? (이름/설정/히스토리 모두 삭제)")) return;
    hardReset();
  });
  el.chkNoRepeat.addEventListener("change", (e) => setNoRepeat(e.target.checked));
  el.chkSound.addEventListener("change", (e) => setSound(e.target.checked));
  el.btnShare.addEventListener("click", shareLink);

  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      startDraw();
      return;
    }
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      resetDrawOnly();
    }
  });

  // Init
  ensureRemaining();
  // Pre-fill textarea from saved names for convenience
  if (state.names.length) el.namesInput.value = state.names.join("\n");
  syncUIFromState();
})();



