export const STANDARD_STATUSES = Object.freeze([
  '집화처리', '간선상차', '간선하차', '배송출발', '배송완료', '미배송', '반품',
]);

const BRANCHES = Object.freeze({
  '11': { code: '11', name: '서울지점', hub: '수도권HUB' },
  '12': { code: '12', name: '용산지점', hub: '수도권HUB' },
  '21': { code: '21', name: '대전지점', hub: '중부HUB' },
  '31': { code: '31', name: '진주지점', hub: '영남HUB' },
  '32': { code: '32', name: '거제지점', hub: '영남HUB' },
  '41': { code: '41', name: '울산지점', hub: '영남HUB' },
});

const GENERAL_AREAS = [
  '서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종',
  '광주', '전북', '전남', '대구', '경북', '부산', '울산', '경남', '거제', '진주',
];
const ISLAND_AREAS = ['울릉도', '백령도', '흑산도', '거문도', '추자도'];
const DESTINATIONS = Object.freeze({
  ...Object.fromEntries(GENERAL_AREAS.map((name) => [name, '일반'])),
  제주: '제주',
  ...Object.fromEntries(ISLAND_AREAS.map((name) => [name, '도서산간'])),
});

const RATE_TABLE = Object.freeze([
  { grade: '극소형', maxSum: 60, maxWeight: 2, price: { 일반: 3500, 제주: 6500, 도서산간: 8500 } },
  { grade: '소형', maxSum: 80, maxWeight: 5, price: { 일반: 4000, 제주: 7000, 도서산간: 9000 } },
  { grade: '중형', maxSum: 120, maxWeight: 15, price: { 일반: 6000, 제주: 9000, 도서산간: 11000 } },
  { grade: '대형', maxSum: 160, maxWeight: 25, price: { 일반: 9000, 제주: 12000, 도서산간: 14000 } },
]);

const ETA_BUSINESS_DAYS = Object.freeze({ 일반: 1, 제주: 2, 도서산간: 3 });
const DELIVERY_SERVICES = Object.freeze({
  economy: { code: 'economy', name: '일반 알뜰택배', surcharge: 0 },
  dawn: { code: 'dawn', name: '새벽택배', surcharge: 3000 },
  same_day: { code: 'same_day', name: '당일택배', surcharge: 5000 },
});
const ITEM_CATEGORIES = new Set(['clothing', 'books', 'living', 'electronics', 'food', 'other']);
const MEASUREMENT_MODES = new Set(['manual', 'auto']);
const INTAKE_TYPES = new Set(['standard', 'reserved', 'customer', 'member', 'shopping', 'branch']);
const INTAKE_FIELDS = Object.freeze({
  standard: [],
  reserved: ['reservationNo'],
  customer: ['customerPhone'],
  member: ['memberNo'],
  shopping: ['shoppingName', 'shoppingNo'],
  branch: ['branchNo'],
});
const HARD_BANNED_KEYWORDS = [
  '현금', '상품권', '유가증권', '금괴', '은괴', '보석', '라이터', '부탄가스', '페인트', '신나',
  '알코올 스프레이', '보조배터리', '리튬배터리 단품', '살아있는 동물', '살아있는 식물',
  '냉장 식품', '냉동 식품', '냉장식품', '냉동식품', '주류', '의약품', '총포', '도검',
];
const REVIEW_KEYWORDS = ['금', '은', '배터리', '동물', '식물', '냉장', '냉동'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ShipmentValidationError extends Error {
  constructor(errors) {
    super(errors[0] || '접수 입력값이 올바르지 않습니다.');
    this.name = 'ShipmentValidationError';
    this.errors = errors;
  }
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^01[016789]\d{7,8}$/.test(digits)) return null;
  return digits.length === 11
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatDate(value) {
  const date = new Date(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function addBusinessDays(value, count) {
  const date = new Date(value);
  let added = 0;
  while (added < count) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) added += 1;
  }
  return date;
}

function normalizeIntake(input) {
  const requestedType = cleanText(input?.type, 20) || 'standard';
  const type = INTAKE_TYPES.has(requestedType) ? requestedType : null;
  if (!type) return null;

  const sourceDetails = input?.details && typeof input.details === 'object' ? input.details : {};
  const details = Object.fromEntries(
    INTAKE_FIELDS[type].map((field) => [field, cleanText(sourceDetails[field], 100)]),
  );
  return { type, details };
}

export function validateAndNormalizeShipment(payload, now = new Date()) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ShipmentValidationError(['접수 요청 형식이 올바르지 않습니다.']);
  }

  const requestId = cleanText(payload.requestId, 36);
  if (!UUID_PATTERN.test(requestId)) errors.push('유효한 접수 요청 번호가 필요합니다.');

  const branchCode = cleanText(payload.branch?.code, 2);
  const branch = BRANCHES[branchCode];
  if (!branch) errors.push('등록된 접수 지점을 선택해 주세요.');

  const senderName = cleanText(payload.sender?.name, 40);
  const receiverName = cleanText(payload.receiver?.name, 40);
  const receiverArea = cleanText(payload.receiver?.area, 20);
  const receiverAddress = cleanText(payload.receiver?.address, 200);
  const receiverPhone = normalizePhone(payload.receiver?.phone);
  const region = DESTINATIONS[receiverArea];
  const itemName = cleanText(payload.item?.name, 80);
  const itemCategory = cleanText(payload.item?.category, 20);
  if (!senderName) errors.push('보내는 분 이름이 필요합니다.');
  if (!receiverName) errors.push('받는 분 이름이 필요합니다.');
  if (!receiverAddress) errors.push('도착 주소가 필요합니다.');
  if (!receiverPhone) errors.push('받는 분 휴대전화번호 형식을 확인해 주세요.');
  if (!region) errors.push('표준 도착 지역을 선택해 주세요.');
  if (!itemName) errors.push('물품명이 필요합니다.');
  if (!ITEM_CATEGORIES.has(itemCategory)) errors.push('표준 품목 카테고리를 선택해 주세요.');

  const deliveryCode = cleanText(payload.delivery?.code, 20) || 'economy';
  const delivery = DELIVERY_SERVICES[deliveryCode];
  if (!delivery) errors.push('지원하는 택배 서비스를 선택해 주세요.');
  const measurementMode = cleanText(payload.measurementMode, 10) || 'manual';
  if (!MEASUREMENT_MODES.has(measurementMode)) errors.push('지원하는 무게 측정 방식을 선택해 주세요.');

  const declaredValue = nonNegativeNumber(payload.item?.declaredValue);
  if (declaredValue === null || declaredValue > 100_000_000) {
    errors.push('택배 물품 가격은 0원 이상 1억원 이하로 입력해 주세요.');
  }

  const rawInput = payload.raw && typeof payload.raw === 'object' && !Array.isArray(payload.raw) ? payload.raw : {};
  const weight = positiveNumber(rawInput.weight ?? rawInput.weight_kg ?? payload.calculation?.weight);
  const width = positiveNumber(rawInput.width ?? rawInput.width_cm ?? payload.calculation?.width);
  const height = positiveNumber(rawInput.height ?? rawInput.height_cm ?? payload.calculation?.height);
  const depth = positiveNumber(rawInput.depth ?? rawInput.depth_cm ?? payload.calculation?.depth);
  if (weight === null) errors.push('실제 무게는 0보다 커야 합니다.');
  if ([width, height, depth].some((value) => value === null)) errors.push('가로·세로·높이는 모두 0보다 커야 합니다.');

  const intake = normalizeIntake(payload.intake);
  if (!intake) errors.push('지원하지 않는 접수 유형입니다.');
  if (intake?.type === 'reserved' && !intake.details.reservationNo) {
    errors.push('예약택배는 예약번호가 필요합니다.');
  }

  if (HARD_BANNED_KEYWORDS.some((keyword) => itemName.includes(keyword))) {
    errors.push('접수할 수 없는 금지 품목입니다.');
  }
  if (itemName.includes('시계') && declaredValue !== null && declaredValue > 500_000) {
    errors.push('50만원을 초과하는 시계는 접수할 수 없습니다.');
  }

  let calculation = null;
  if (weight !== null && width !== null && height !== null && depth !== null && region) {
    const volumeWeight = round((width * height * depth) / 6000);
    const billedWeight = round(Math.max(weight, volumeWeight));
    const dimensionSum = round(width + height + depth, 1);
    const rate = RATE_TABLE.find((row) => dimensionSum <= row.maxSum && billedWeight <= row.maxWeight);
    if (!rate) {
      errors.push('대형 접수 한도(25kg 또는 세 변의 합 160cm)를 초과했습니다.');
    } else {
      calculation = {
        weight: round(weight), width: round(width), height: round(height), depth: round(depth),
        volumeWeight, billedWeight, dimensionSum, grade: rate.grade, region,
        basePrice: rate.price[region],
        price: rate.price[region] + (delivery?.surcharge || 0),
        etaDate: formatDate(addBusinessDays(now, ETA_BUSINESS_DAYS[region])),
      };
    }
  }

  if (errors.length > 0) throw new ShipmentValidationError([...new Set(errors)]);

  const reviewRequired = REVIEW_KEYWORDS.some((keyword) => itemName.includes(keyword));
  const acceptedAt = new Date(now).toISOString();
  const preservedInput = {
    branchCode,
    destination: receiverArea,
    senderName,
    receiverName,
    receiverAddress,
    receiverPhone,
    itemName,
    itemCategory,
    declaredValue,
    weight,
    width,
    height,
    depth,
  };
  return {
    requestId,
    acceptedAt,
    policyVersion: '2026-08-06',
    status: '집화처리',
    branch,
    sender: { name: senderName },
    receiver: {
      name: receiverName,
      phone: receiverPhone,
      area: receiverArea,
      address: receiverAddress,
      region,
    },
    item: { name: itemName, category: itemCategory, declaredValue },
    delivery,
    measurementMode,
    intake,
    raw: preservedInput,
    calculation,
    review: reviewRequired
      ? { status: 'pending', reason: '조건 확인이 필요한 품목 표현입니다.' }
      : { status: 'none', reason: '' },
  };
}

export function toDatabaseRecord(record, trackingNo) {
  return {
    tracking_no: trackingNo,
    request_id: record.requestId,
    accepted_at: record.acceptedAt,
    branch_code: record.branch.code,
    branch_name: record.branch.name,
    sender_name: record.sender.name,
    receiver_name: record.receiver.name,
    receiver_area: record.receiver.area,
    region_type: record.calculation.region,
    item_name: record.item.name,
    weight_kg: record.calculation.weight,
    width_cm: record.calculation.width,
    height_cm: record.calculation.height,
    depth_cm: record.calculation.depth,
    billed_weight_kg: record.calculation.billedWeight,
    volume_weight_kg: record.calculation.volumeWeight,
    dimension_sum_cm: record.calculation.dimensionSum,
    calculated_billed_weight_kg: record.calculation.billedWeight,
    size_grade: record.calculation.grade,
    declared_value: record.item.declaredValue,
    price: record.calculation.price,
    eta_date: record.calculation.etaDate,
    status: record.status,
    normalized_region_type: record.calculation.region,
    normalized_status: record.status,
    policy_version: record.policyVersion,
    raw_input: {
      intake: record.intake,
      input: record.raw,
      itemCategory: record.item.category,
      delivery: record.delivery,
      measurementMode: record.measurementMode,
    },
    review_status: record.review.status,
    review_reason: record.review.reason || null,
  };
}

export function validateStatusUpdate(payload) {
  const trackingNo = cleanText(payload?.trackingNo, 10);
  const status = cleanText(payload?.status, 20);
  const errors = [];
  if (!/^\d{10}$/.test(trackingNo)) errors.push('운송장 번호는 숫자 10자리여야 합니다.');
  if (!STANDARD_STATUSES.includes(status)) errors.push('표준 배송 상태만 저장할 수 있습니다.');
  if (errors.length > 0) throw new ShipmentValidationError(errors);
  return { trackingNo, status };
}
