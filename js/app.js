// ============================================================
// app.js — инициализация, состояние, роутинг
// ============================================================

const App = (() => {

  // ── Состояние ─────────────────────────────────────────
  let rows = [];
  let uid  = 1;

  // ── Получить настройки из DOM ─────────────────────────
  function getSettings() {
    return {
      name:     document.getElementById('drv-name').value.trim(),
      period:   document.getElementById('drv-period').value.trim(),
      oklad:    parseFloat(document.getElementById('drv-oklad').value)    || 0,
      official: parseFloat(document.getElementById('official').value)     || 0,
      advance:  parseFloat(document.getElementById('advance').value)      || 0,
      fuel:     parseFloat(document.getElementById('fuel').value)         || 0,
    };
  }

  // ── Сохранить / загрузить настройки ──────────────────
  function saveSettings() {
    const s = getSettings();
    localStorage.setItem('tabel_cfg', JSON.stringify({
      name: s.name, oklad: s.oklad, period: s.period,
    }));
  }

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('tabel_cfg') || '{}');
      if (s.name)   document.getElementById('drv-name').value   = s.name;
      if (s.oklad)  document.getElementById('drv-oklad').value  = s.oklad;
      if (s.period) document.getElementById('drv-period').value = s.period;
    } catch (e) {}
  }

  // ── Рендер ───────────────────────────────────────────
  function render() {
    const s = getSettings();
    UI.renderTable(rows);
    UI.renderTotals(rows, s);
    UI.renderHeader(s.name, s.period);
    document.getElementById('row-badge').textContent = rows.length ? `(${rows.length})` : '';
  }

  // ── Парсинг чата ──────────────────────────────────────
  function parsePaste() {
    const text = document.getElementById('chat-in').value.trim();
    if (!text) return;

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

    document.getElementById('chat-in').value = '';
    render();
    if (added) switchTab('tabel');
  }

  // ── Добавить строку вручную ───────────────────────────
  function addManual() {
    let mraw = document.getElementById('a-machine').value.trim();
    mraw = Parser.normalizeAliases(mraw);
    const machine = CFG.LABELS[mraw] || mraw;

    rows.push({
      id:       uid++,
      date:     document.getElementById('a-date').value.trim()  || '—',
      machine,
      workType: '',
      address:  document.getElementById('a-addr').value.trim(),
      cargo:    document.getElementById('a-cargo').value.trim(),
      client:   document.getElementById('a-client').value.trim(),
      hours:    parseFloat(document.getElementById('a-hours').value) || '',
      trips:    parseInt(document.getElementById('a-trips').value)   || '',
      orderSum: '',
      pay:      '',
    });

    ['a-date','a-machine','a-addr','a-cargo','a-client','a-hours','a-trips']
      .forEach(id => document.getElementById(id).value = '');

    render();
    switchTab('tabel');
  }

  // ── Удалить / обновить строку ─────────────────────────
  function delRow(id) {
    rows = rows.filter(r => r.id !== id);
    render();
  }

  function updRow(id, field, val) {
    const r = rows.find(r => r.id === id);
    if (!r) return;
    r[field] = ['hours','trips','pay','orderSum'].includes(field)
      ? (parseFloat(val) || '')
      : val;
    UI.renderTotals(rows, getSettings());
  }

  // ── Очистить табель ───────────────────────────────────
  function clearAll() {
    if (!confirm('Очистить табель? Настройки останутся.')) return;
    rows = [];
    ['official','advance','fuel','chat-in'].forEach(id => {
      document.getElementById(id).value = '';
    });
    render();
    switchTab('insert');
  }

  // ── Копировать текстом ────────────────────────────────
  function copyText() {
    const s = getSettings();
    const { totalH, totalT, totalP } = Calculator.calcTotals(rows);
    const { base, rest }             = Calculator.calcPayout(s);
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
    const s = getSettings();
    const totals = Calculator.calcTotals(rows);
    await PDFGenerator.save(rows, s, totals);
  }

  async function sharePDF() {
    const s = getSettings();
    const totals = Calculator.calcTotals(rows);
    await PDFGenerator.share(rows, s, totals);
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

  // ── Инициализация ─────────────────────────────────────
  function init() {
    loadSettings();
    render();

    // Слушатели настроек
    ['drv-name','drv-oklad','drv-period'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        saveSettings();
        render();
      });
    });
    ['official','advance','fuel'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        UI.renderTotals(rows, getSettings());
      });
    });

    // Вкладки
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Кнопки
    document.getElementById('parse-btn').addEventListener('click', parsePaste);
    document.getElementById('add-manual-btn').addEventListener('click', addManual);
    document.getElementById('copy-text-btn').addEventListener('click', copyText);
    document.getElementById('clear-all-btn').addEventListener('click', clearAll);
    document.getElementById('save-pdf-btn').addEventListener('click', savePDF);
    document.getElementById('share-pdf-btn').addEventListener('click', sharePDF);
  }

  // Публичный API (нужен для inline обработчиков в таблице)
  return { init, updRow, delRow, switchTab };

})();

// ── Пароль ────────────────────────────────────────────────
(function initAuth() {
  const PASSWORD = 'tabel2025';

  function unlock() {
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('main-app').style.display   = 'block';
    App.init();
  }

  if (sessionStorage.getItem('tabel_auth') === 'true') {
    unlock();
    return;
  }

  document.getElementById('auth-submit').addEventListener('click', () => {
    const pw  = document.getElementById('auth-password').value;
    const err = document.getElementById('auth-error');
    if (pw === PASSWORD) {
      sessionStorage.setItem('tabel_auth', 'true');
      unlock();
    } else {
      err.textContent = 'Неверный пароль';
      document.getElementById('auth-password').value = '';
    }
  });

  document.getElementById('auth-password').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('auth-submit').click();
  });
})();

// ── Service Worker ────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
