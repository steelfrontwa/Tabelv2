// ============================================================
// app.js — инициализация, состояние, роутинг
// ============================================================

function getEl(id) {
  return document.getElementById(id);
}

const App = (() => {

  // ── Состояние ─────────────────────────────────────────
  let rows = [];
  let uid  = 1;
  let profile = {
    name: '',
    period: '',
    oklad: 0,
    activeMachines: [],
    rateMap: {},
  };

  const MACHINE_ORDER = ['4850','4930','3977','6547','7368','607','628','570','764','796','542','2054'];

  function getProfile() {
    return profile;
  }

  function setProfile(nextProfile) {
    profile = {
      name: nextProfile.name || '',
      period: nextProfile.period || '',
      oklad: parseFloat(nextProfile.oklad) || 0,
      activeMachines: Array.isArray(nextProfile.activeMachines) ? nextProfile.activeMachines : [],
      rateMap: nextProfile.rateMap || {},
    };
  }

  function setStatus(message, type = 'info') {
    const status = getEl('app-status');
    if (!status) return;
    if (!message) {
      status.textContent = '';
      status.className = 'app-status';
      status.style.display = 'none';
      return;
    }
    status.className = 'app-status is-visible is-' + type;
    status.textContent = message;
  }

  function machineIdForRow(row) {
    return CFG.getMachineIdByLabel(row.machine);
  }

  function rateForMachine(machineId) {
    const rate = parseFloat(profile.rateMap?.[machineId]);
    return Number.isFinite(rate) && rate > 0 ? rate : 0;
  }

  function rowPayPreview(row) {
    const machineId = machineIdForRow(row);
    const rate = rateForMachine(machineId);
    const hours = parseFloat(row.hours) || 0;
    if (!machineId || !profile.activeMachines.includes(machineId) || !rate || !hours) return null;
    return hours * rate;
  }

  function requireEl(id) {
    const el = getEl(id);
    if (!el) throw new Error('Не найден элемент #' + id);
    return el;
  }

  // ── Получить настройки из DOM ─────────────────────────
  function getSettings() {
    return {
      name:     profile.name,
      period:   profile.period,
      oklad:    profile.oklad,
      official: parseFloat(getEl('official')?.value)     || 0,
      advance:  parseFloat(getEl('advance')?.value)      || 0,
      fuel:     parseFloat(getEl('fuel')?.value)         || 0,
    };
  }

  // ── Сохранить / загрузить настройки ──────────────────
  function saveSettings() {
    const s = getSettings();
    localStorage.setItem('tabel_cfg', JSON.stringify({
      name: s.name, oklad: s.oklad, period: s.period,
      activeMachines: profile.activeMachines,
      rateMap: profile.rateMap,
    }));
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('tabel_cfg') || '{}');
      setProfile(s);
    } catch (e) {}
  }

  function renderProfilePreview() {
    const nameEl = getEl('driver-pill-name');
    const metaEl = getEl('driver-pill-meta');
    if (nameEl) nameEl.textContent = profile.name || 'Водитель';
    if (metaEl) {
      const activeCount = profile.activeMachines.length;
      metaEl.textContent = `${profile.period || 'Без периода'} · ${activeCount} техн.`;
    }
  }

  // ── Рендер ───────────────────────────────────────────
  function render() {
    try {
      const s = getSettings();
      UI.renderTable(rows);
      UI.renderTotals(rows, s);
      UI.renderHeader(s.name, s.period);
      const rowBadge = getEl('row-badge');
      if (rowBadge) {
        rowBadge.textContent = rows.length ? String(rows.length) : '';
        rowBadge.style.display = rows.length ? 'inline-block' : 'none';
      }
      renderProfilePreview();
    } catch (e) {
      console.error(e);
      setStatus('Ошибка рендера: ' + e.message, 'error');
    }
  }

  // ── Парсинг чата ──────────────────────────────────────
  function parsePaste() {
    const source = getEl('chat-in');
    const text = source ? source.value.trim() : '';
    if (!text) return;

    try {
      setStatus('Разбираю сообщения…', 'info');
      const parsed = Parser.parseChat(text);
      let added = 0;

      parsed.forEach(r => {
        r.id = uid++;
        rows.push(r);
        added++;
      });

      // Пересортировать
      rows.sort((a, b) => {
        const [ad, am] = a.date.split('.').map(Number);
        const [bd, bm] = b.date.split('.').map(Number);
        return (am - bm) || (ad - bd);
      });

      if (source) source.value = '';
      render();
      if (added) {
        setStatus(`Готово: добавлено ${added} строк${added === 1 ? 'а' : added < 5 ? 'и' : ''}.`, 'success');
        switchTab('tabel');
      } else {
        setStatus('Не удалось распознать строки. Проверь формат сообщения.', 'error');
      }
    } catch (e) {
      console.error(e);
      setStatus('Ошибка разбора: ' + e.message, 'error');
    }
  }

  // ── Добавить строку вручную ───────────────────────────
  function addManual() {
    try {
      let mraw = getEl('a-machine')?.value.trim() || '';
      mraw = Parser.normalizeAliases(mraw);
      const machine = CFG.LABELS[mraw] || mraw;

      rows.push({
        id:       uid++,
        date:     getEl('a-date')?.value.trim()  || '—',
        machine,
        workType: '',
        address:  getEl('a-addr')?.value.trim() || '',
        cargo:    getEl('a-cargo')?.value.trim() || '',
        client:   getEl('a-client')?.value.trim() || '',
        hours:    parseFloat(getEl('a-hours')?.value) || '',
        trips:    parseInt(getEl('a-trips')?.value)   || '',
        orderSum: '',
        pay:      '',
        payManual: false,
      });

      ['a-date','a-machine','a-addr','a-cargo','a-client','a-hours','a-trips']
        .forEach(id => { const el = getEl(id); if (el) el.value = ''; });

      render();
      setStatus('Строка добавлена вручную.', 'success');
      switchTab('tabel');
    } catch (e) {
      console.error(e);
      setStatus('Ошибка добавления строки: ' + e.message, 'error');
    }
  }

  // ── Удалить / обновить строку ─────────────────────────
  function delRow(id) {
    rows = rows.filter(r => r.id !== id);
    render();
    setStatus('Строка удалена.', 'info');
  }

  function updRow(id, field, val) {
    const r = rows.find(r => r.id === id);
    if (!r) return;
    r[field] = ['hours','trips','pay','orderSum'].includes(field)
      ? (parseFloat(val) || '')
      : val;
    if (field === 'pay') r.payManual = true;
    UI.renderTotals(rows, getSettings());
  }

  // ── Очистить табель ───────────────────────────────────
  function clearAll() {
    if (!confirm('Очистить табель? Настройки останутся.')) return;
    rows = [];
    ['official','advance','fuel','chat-in'].forEach(id => {
      const el = getEl(id);
      if (el) el.value = '';
    });
    render();
    setStatus('Табель очищен.', 'info');
    switchTab('insert');
  }

  // ── Копировать текстом ────────────────────────────────
  function copyText() {
    const s = getSettings();
    const { totalH, totalT, totalP } = Calculator.calcTotals(rows, profile);
    const { base, rest }             = Calculator.calcPayout({
      totalP,
      oklad:    s.oklad,
      official: s.official,
      advance:  s.advance,
      fuel:     s.fuel,
    });
    const f = UI.fmt;

    let t = `ТАБЕЛЬ: ${s.name || 'Водитель'}\n`;
    if (s.period) t += `Период: ${s.period}\n`;
    t += '─'.repeat(50) + '\n';

    rows.forEach(r => {
      const d  = r.date.padEnd(8);
      const m  = (r.machine  || '').substring(0,14).padEnd(15);
      const a  = (r.address  || '').substring(0,18).padEnd(19);
      const os = r.orderSum ? f(r.orderSum)+'₽' : '—';
      const h  = String(r.hours || '').padEnd(4);
      const tr = String(r.trips || '').padEnd(4);
      const p  = r.pay !== '' ? f(r.pay)+' ₽' : '—';
      t += `${d} ${m} ${a} ${os.padEnd(8)} ${h} ${tr} ${p}\n`;
    });

    t += '─'.repeat(50) + '\n';
    t += `Часов: ${totalH}  Рейсов: ${totalT}  Начислено: ${f(totalP)} ₽\n`;
    if (s.oklad)    t += `Оклад: ${f(s.oklad)} ₽\n`;
    t += `База: ${f(base)} ₽\n`;
    if (s.official) t += `Офиц. доход: −${f(s.official)} ₽\n`;
    if (s.advance)  t += `Авансы: −${f(s.advance)} ₽\n`;
    if (s.fuel)     t += `Заправки: −${f(s.fuel)} ₽\n`;
    t += `НА РУКИ: ${f(rest)} ₽`;

    navigator.clipboard.writeText(t)
      .then(() => alert('Скопировано!'))
      .catch(() => alert('Ошибка — скопируй вручную'));
  }

  // ── PDF ───────────────────────────────────────────────
  async function savePDF() {
    try {
      setStatus('Готовлю PDF…', 'info');
      const s = getSettings();
      const totals = Calculator.calcTotals(rows, profile);
      await PDFGenerator.save(rows, { ...s, activeMachines: profile.activeMachines, rateMap: profile.rateMap }, totals);
      setStatus('PDF сохранён.', 'success');
    } catch (e) {
      console.error(e);
      setStatus('Ошибка PDF: ' + e.message, 'error');
    }
  }

  async function sharePDF() {
    try {
      setStatus('Подготавливаю отправку PDF…', 'info');
      const s = getSettings();
      const totals = Calculator.calcTotals(rows, profile);
      await PDFGenerator.share(rows, { ...s, activeMachines: profile.activeMachines, rateMap: profile.rateMap }, totals);
      setStatus('PDF готов к отправке.', 'success');
    } catch (e) {
      console.error(e);
      setStatus('Ошибка отправки PDF: ' + e.message, 'error');
    }
  }

  // ── Вкладки ───────────────────────────────────────────
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('.tab-content').forEach(c =>
      c.classList.toggle('active', c.id === 'tab-' + name));
    if (name === 'tabel') UI.renderTable(rows);
    if (name === 'itogi') UI.renderTotals(rows, getSettings());
  }

  function renderProfileForm() {
    const grid = getEl('machine-grid');
    const rates = getEl('rate-list');
    if (!grid || !rates) return;

    grid.innerHTML = MACHINE_ORDER.map(id => {
      const label = CFG.getMachineLabelById(id);
      const active = profile.activeMachines.includes(id);
      const rate = profile.rateMap[id] ?? '';
      return `
        <label class="machine-chip ${active ? 'is-active' : ''}">
          <input type="checkbox" data-machine-toggle="${id}" ${active ? 'checked' : ''}>
          <div class="label">${label}</div>
          <div class="meta">${id === '2054' ? 'Мини заказчика' : 'Техника для табеля'}</div>
        </label>`;
    }).join('');

    rates.innerHTML = MACHINE_ORDER.filter(id => profile.activeMachines.includes(id)).map(id => {
      const label = CFG.getMachineLabelById(id);
      const rate = profile.rateMap[id] ?? '';
      return `
        <div class="rate-item">
          <div>
            <strong>${label}</strong>
            <span>${id}</span>
          </div>
          <input type="number" inputmode="decimal" placeholder="0" value="${rate}" data-rate-input="${id}">
        </div>`;
    }).join('') || '<div class="empty-state">Сначала включи хотя бы одну технику.</div>';
  }

  function bindProfileForm() {
    const grid = getEl('machine-grid');
    const rates = getEl('rate-list');
    const save = getEl('profile-save');
    if (grid && !grid.dataset.bound) {
      grid.dataset.bound = 'true';
      grid.addEventListener('change', e => {
        const target = e.target;
        if (!target || !target.dataset.machineToggle) return;
        const id = target.dataset.machineToggle;
        if (target.checked) {
          if (!profile.activeMachines.includes(id)) profile.activeMachines.push(id);
        } else {
          profile.activeMachines = profile.activeMachines.filter(x => x !== id);
          delete profile.rateMap[id];
        }
        renderProfileForm();
      });
    }
    if (rates && !rates.dataset.bound) {
      rates.dataset.bound = 'true';
      rates.addEventListener('input', e => {
        const target = e.target;
        if (!target || !target.dataset.rateInput) return;
        profile.rateMap[target.dataset.rateInput] = parseFloat(target.value) || 0;
      });
    }
    if (save && !save.dataset.bound) {
      save.dataset.bound = 'true';
      save.addEventListener('click', () => {
        profile.name = getEl('profile-name')?.value.trim() || '';
        profile.period = getEl('profile-period')?.value.trim() || '';
        profile.oklad = parseFloat(getEl('profile-oklad')?.value) || 0;
        if (profile.activeMachines.length === 0) {
          setStatus('Выбери хотя бы одну технику.', 'error');
          return;
        }
        saveSettings();
        renderProfilePreview();
        getEl('profile-modal').style.display = 'none';
        getEl('main-app').style.display = 'block';
        App.init();
        setStatus('Профиль сохранён. Можно разбирать сообщения.', 'success');
      });
    }
  }

  function openProfileScreen() {
    getEl('auth-modal').style.display = 'none';
    getEl('profile-modal').style.display = 'block';
    getEl('main-app').style.display = 'none';
    setElFromProfile();
    renderProfileForm();
    bindProfileForm();
    setStatus('Настрой профиль водителя и технику.', 'info');
  }

  function setElFromProfile() {
    if (getEl('profile-name')) getEl('profile-name').value = profile.name || '';
    if (getEl('profile-period')) getEl('profile-period').value = profile.period || '';
    if (getEl('profile-oklad')) getEl('profile-oklad').value = profile.oklad || '';
  }

  // ── Инициализация ─────────────────────────────────────
  function init() {
    try {
      loadSettings();
      render();

      // Слушатели настроек
      ['drv-name','drv-oklad','drv-period'].forEach(id => {
        const el = requireEl(id);
        el.addEventListener('input', () => {
          saveSettings();
          render();
        });
      });
      ['official','advance','fuel'].forEach(id => {
        const el = requireEl(id);
        el.addEventListener('input', () => {
          UI.renderTotals(rows, getSettings());
        });
      });

      // Вкладки
      document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
      });

      // Кнопки
      requireEl('parse-btn').addEventListener('click', parsePaste);
      requireEl('add-manual-btn').addEventListener('click', addManual);
      requireEl('copy-text-btn').addEventListener('click', copyText);
      requireEl('clear-all-btn').addEventListener('click', clearAll);
      requireEl('save-pdf-btn').addEventListener('click', savePDF);
      requireEl('share-pdf-btn').addEventListener('click', sharePDF);

      setStatus('Готово. Вставьте сообщения и нажмите «Разобрать».', 'info');
    } catch (e) {
      console.error(e);
      setStatus('Ошибка инициализации: ' + e.message, 'error');
      throw e;
    }
  }

  // Публичный API (нужен для inline обработчиков в таблице)
  return { init, updRow, delRow, switchTab, getProfile, openProfileScreen };

})();

window.App = App;

// ── Пароль ────────────────────────────────────────────────
(function initAuth() {
  const PASSWORD = 'tabel2025';

  function unlock() {
    App.openProfileScreen();
  }

  if (sessionStorage.getItem('tabel_auth') === 'true') {
    unlock();
    return;
  }

  document.getElementById('auth-submit').addEventListener('click', () => {
    const pw  = getEl('auth-password').value;
    const err = getEl('auth-error');
    if (pw === PASSWORD) {
      sessionStorage.setItem('tabel_auth', 'true');
      unlock();
    } else {
      err.textContent = 'Неверный пароль';
      getEl('auth-password').value = '';
    }
  });

  document.getElementById('auth-password').addEventListener('keypress', e => {
    if (e.key === 'Enter') getEl('auth-submit').click();
  });
})();

// ── Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
  });
}
