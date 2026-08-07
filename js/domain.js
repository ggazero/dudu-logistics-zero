(function (global) {
  'use strict';

  const policy = global.DuduPolicy;

  function positiveNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function nonNegativeNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function findBranch(code) {
    return policy.BRANCHES.find((branch) => branch.code === String(code)) || null;
  }

  function findDestination(name) {
    return policy.DESTINATIONS.find((area) => area.name === name) || null;
  }

  function evaluateItem(itemName, declaredValue) {
    const name = String(itemName || '').trim();
    const value = nonNegativeNumber(declaredValue);
    if (!name) return { outcome: 'empty', reason: '물품명을 입력하세요.', hits: [] };

    if (name.includes('시계')) {
      if (value === null) {
        return { outcome: 'review', reason: '시계는 50만원 초과 여부를 확인해야 합니다.', hits: ['시계'] };
      }
      if (value > 500000) {
        return { outcome: 'blocked', reason: '50만원을 초과하는 시계는 접수할 수 없습니다.', hits: ['시계'] };
      }
    }

    for (const rule of policy.HARD_BANNED) {
      const keyword = rule.keywords.find((candidate) => name.includes(candidate));
      if (keyword) {
        return {
          outcome: 'blocked',
          reason: `${rule.category} 금지 품목 “${keyword}”에 해당합니다.`,
          hits: [keyword],
        };
      }
    }

    const ambiguous = policy.REVIEW_KEYWORDS.filter((keyword) => name.includes(keyword));
    if (ambiguous.length > 0) {
      return {
        outcome: 'review',
        reason: `“${ambiguous.join(', ')}” 표현만으로 금지 품목인지 확정할 수 없습니다.`,
        hits: ambiguous,
      };
    }

    return {
      outcome: 'clear',
      reason: name.includes('시계') ? '신고 가액이 50만원 이하인 시계입니다.' : '자동 차단 목록에 해당하지 않습니다.',
      hits: [],
    };
  }

  function calculate({ weight, width, height, depth, destination }) {
    const numbers = {
      weight: positiveNumber(weight),
      width: positiveNumber(width),
      height: positiveNumber(height),
      depth: positiveNumber(depth),
    };
    const errors = [];
    if (numbers.weight === null) errors.push('실제 무게를 0보다 큰 숫자로 입력하세요.');
    if ([numbers.width, numbers.height, numbers.depth].some((value) => value === null)) {
      errors.push('가로·세로·높이를 모두 0보다 큰 숫자로 입력하세요.');
    }
    const area = findDestination(destination);
    if (!area) errors.push('도착 지역을 표준 목록에서 선택하세요.');
    if (errors.length > 0) return { ok: false, errors };

    const volumeWeight = (numbers.width * numbers.height * numbers.depth) / 6000;
    const billedWeight = Math.max(numbers.weight, volumeWeight);
    const dimensionSum = numbers.width + numbers.height + numbers.depth;
    const tier = policy.RATE_TABLE.find((row) => dimensionSum <= row.maxSum && billedWeight <= row.maxWeight) || null;

    if (!tier) {
      return {
        ok: false,
        errors: [`대형 상한을 초과했습니다. 세 변의 합 ${dimensionSum.toFixed(1)}cm, 요금 무게 ${billedWeight.toFixed(2)}kg입니다.`],
        volumeWeight,
        billedWeight,
        dimensionSum,
      };
    }

    return {
      ok: true,
      weight: numbers.weight,
      width: numbers.width,
      height: numbers.height,
      depth: numbers.depth,
      volumeWeight,
      billedWeight,
      dimensionSum,
      grade: tier.grade,
      region: area.region,
      price: tier.price[area.region],
    };
  }

  function addBusinessDays(from, count) {
    const date = new Date(from);
    date.setHours(12, 0, 0, 0);
    let added = 0;
    while (added < count) {
      date.setDate(date.getDate() + 1);
      if (date.getDay() !== 0 && date.getDay() !== 6) added += 1;
    }
    return date;
  }

  function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function nextTrackingNo(branchCode, shipments) {
    const suffixes = shipments
      .map((shipment) => shipment.trackingNo)
      .filter((trackingNo) => String(trackingNo).startsWith(branchCode))
      .map((trackingNo) => Number(String(trackingNo).slice(2)))
      .filter(Number.isFinite);
    let next = suffixes.length > 0 ? Math.max(...suffixes) + 1 : 1;
    let candidate = branchCode + String(next).padStart(8, '0');
    const issued = new Set(shipments.map((shipment) => shipment.trackingNo));
    while (issued.has(candidate)) {
      next += 1;
      candidate = branchCode + String(next).padStart(8, '0');
    }
    return candidate;
  }

  global.DuduDomain = Object.freeze({
    positiveNumber,
    nonNegativeNumber,
    findBranch,
    findDestination,
    evaluateItem,
    calculate,
    addBusinessDays,
    formatDate,
    nextTrackingNo,
  });
})(globalThis);
