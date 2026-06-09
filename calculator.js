// ============================================================
// calculator.js — логика расчёта зарплаты
// ============================================================

const Calculator = (() => {

  // Считает итоги по массиву строк табеля
  function calcTotals(rows) {
    const totalH = rows.reduce((a, r) => a + (parseFloat(r.hours) || 0), 0);
    const totalT = rows.reduce((a, r) => a + (parseInt(r.trips)   || 0), 0);
    const totalP = rows.reduce((a, r) => a + (parseFloat(r.pay)   || 0), 0);
    return { totalH, totalT, totalP };
  }

  // Считает итоговую сумму к выдаче
  // Формула:
  //   база = MAX(начислено по табелю, фикс. оклад)
  //   на руки = база − официальный доход − авансы − заправки
  function calcPayout({ totalP, oklad, official, advance, fuel }) {
    const base = oklad > 0 ? Math.max(totalP, oklad) : totalP;
    const rest = base - (official || 0) - (advance || 0) - (fuel || 0);
    const hint = oklad > 0
      ? (totalP >= oklad ? '↑ табель > оклада' : '↓ оклад > табеля')
      : '';
    return { base, rest, hint };
  }

  return { calcTotals, calcPayout };

})();
