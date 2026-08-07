import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ShipmentValidationError,
  toDatabaseRecord,
  validateAndNormalizeShipment,
  validateStatusUpdate,
} from '../api/shipment-model.js';

const NOW = new Date('2026-08-07T06:00:00.000Z');

function validPayload(overrides = {}) {
  return {
    requestId: '7675d024-82f9-4c8d-a334-4ab73bf51735',
    policyVersion: '2026-08-06',
    branch: { code: '11', name: '변조된 지점명' },
    sender: { name: '김발송' },
    receiver: {
      name: '이수령', phone: '010-1234-5678', area: '서울',
      address: '서울시 중구 테스트로 10', region: '변조된 권역',
    },
    item: { name: '셔츠', category: 'clothing', declaredValue: 10000 },
    delivery: { code: 'economy' },
    measurementMode: 'manual',
    intake: { type: 'customer', details: { customerPhone: '010-1234-5678', ignored: '제외' } },
    raw: { weight: '2', width: '20', height: '20', depth: '20' },
    calculation: { price: 1, grade: '대형', billedWeight: 99 },
    ...overrides,
  };
}

test('서버가 지점·권역·요금을 다시 계산하고 클라이언트 계산값을 무시한다', () => {
  const record = validateAndNormalizeShipment(validPayload(), NOW);
  assert.equal(record.branch.name, '서울지점');
  assert.equal(record.receiver.region, '일반');
  assert.equal(record.receiver.address, '서울시 중구 테스트로 10');
  assert.equal(record.receiver.phone, '010-1234-5678');
  assert.equal(record.calculation.grade, '극소형');
  assert.equal(record.calculation.billedWeight, 2);
  assert.equal(record.calculation.price, 3500);
  assert.equal(record.calculation.etaDate, '2026-08-10');
});

test('접수 유형별 값은 공통 입력과 분리해 DB 원본 JSON에 저장한다', () => {
  const record = validateAndNormalizeShipment(validPayload(), NOW);
  const dbRecord = toDatabaseRecord(record, '1142379482');
  assert.deepEqual(dbRecord.raw_input.intake, {
    type: 'customer',
    details: { customerPhone: '010-1234-5678' },
  });
  assert.equal(dbRecord.raw_input.input.weight, 2);
  assert.equal(dbRecord.raw_input.itemCategory, 'clothing');
  assert.equal(dbRecord.raw_input.delivery.code, 'economy');
  assert.equal(dbRecord.raw_input.intake.details.ignored, undefined);
});

test('미등록 지점과 잘못된 측정값은 서버에서 차단한다', () => {
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({
      branch: { code: '00' },
      raw: { weight: -1, width: 0, height: 20, depth: 20 },
    }), NOW),
    (error) => error instanceof ShipmentValidationError
      && error.errors.some((message) => message.includes('접수 지점'))
      && error.errors.some((message) => message.includes('실제 무게')),
  );
});

test('도착 주소가 없으면 서버에서 접수를 차단한다', () => {
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({ receiver: { name: '이수령', area: '서울', address: '' } }), NOW),
    /도착 주소/,
  );
});

test('받는 분 휴대전화번호 형식이 잘못되면 서버에서 차단한다', () => {
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({
      receiver: { name: '이수령', phone: '02-123-4567', area: '서울', address: '서울 테스트로 10' },
    }), NOW),
    /휴대전화번호/,
  );
});

test('금지 품목과 한도 초과 화물은 서버에서 차단한다', () => {
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({ item: { name: '현금', category: 'other', declaredValue: 1000 } }), NOW),
    /금지 품목/,
  );
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({ raw: { weight: 30, width: 20, height: 20, depth: 20 } }), NOW),
    /대형 접수 한도/,
  );
});

test('택배 서비스 추가요금과 자동저울 측정 방식을 검증한다', () => {
  const record = validateAndNormalizeShipment(validPayload({
    delivery: { code: 'same_day' },
    measurementMode: 'auto',
  }), NOW);
  assert.equal(record.delivery.name, '당일택배');
  assert.equal(record.calculation.basePrice, 3500);
  assert.equal(record.calculation.price, 8500);
  assert.equal(record.measurementMode, 'auto');
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({ delivery: { code: 'unknown' } }), NOW),
    /택배 서비스/,
  );
});

test('예약번호와 표준 배송 상태를 검증한다', () => {
  assert.throws(
    () => validateAndNormalizeShipment(validPayload({ intake: { type: 'reserved', details: {} } }), NOW),
    /예약번호/,
  );
  assert.deepEqual(validateStatusUpdate({ trackingNo: '1142379482', status: '배송완료' }), {
    trackingNo: '1142379482', status: '배송완료',
  });
  assert.throws(() => validateStatusUpdate({ trackingNo: 'ABC', status: '배송중' }), ShipmentValidationError);
});
