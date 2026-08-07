(function (global) {
  'use strict';

  const BRANCHES = [
    { code: '11', name: '서울지점', hub: '수도권HUB' },
    { code: '12', name: '용산지점', hub: '수도권HUB' },
    { code: '21', name: '대전지점', hub: '중부HUB' },
    { code: '31', name: '진주지점', hub: '영남HUB' },
    { code: '32', name: '거제지점', hub: '영남HUB' },
    { code: '41', name: '울산지점', hub: '영남HUB' },
  ];

  const GENERAL_AREAS = [
    '서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종',
    '광주', '전북', '전남', '대구', '경북', '부산', '울산', '경남',
    '거제', '진주',
  ];
  const ISLAND_AREAS = ['울릉도', '백령도', '흑산도', '거문도', '추자도'];
  const DESTINATIONS = [
    ...GENERAL_AREAS.map((name) => ({ name, region: '일반' })),
    { name: '제주', region: '제주' },
    ...ISLAND_AREAS.map((name) => ({ name, region: '도서산간' })),
  ];

  const RATE_TABLE = [
    { grade: '극소형', maxSum: 60, maxWeight: 2, price: { 일반: 3500, 제주: 6500, 도서산간: 8500 } },
    { grade: '소형', maxSum: 80, maxWeight: 5, price: { 일반: 4000, 제주: 7000, 도서산간: 9000 } },
    { grade: '중형', maxSum: 120, maxWeight: 15, price: { 일반: 6000, 제주: 9000, 도서산간: 11000 } },
    { grade: '대형', maxSum: 160, maxWeight: 25, price: { 일반: 9000, 제주: 12000, 도서산간: 14000 } },
  ];

  const ETA_BUSINESS_DAYS = { 일반: 1, 제주: 2, 도서산간: 3 };
  const STANDARD_STATUSES = ['집화처리', '간선상차', '간선하차', '배송출발', '배송완료', '미배송', '반품'];
  // 정책서에 서비스별 추가요금이 없어 실습 화면에서만 사용하는 임시값이다.
  const DELIVERY_SERVICES = [
    { code: 'economy', name: '일반 알뜰택배', surcharge: 0, description: '기본 요금 · 정책 예정일 적용' },
    { code: 'dawn', name: '새벽택배', surcharge: 3000, description: '실습 추가요금 3,000원' },
    { code: 'same_day', name: '당일택배', surcharge: 5000, description: '실습 추가요금 5,000원' },
  ];
  const ITEM_CATEGORIES = [
    { code: 'clothing', name: '의류' },
    { code: 'books', name: '도서·문구' },
    { code: 'living', name: '생활용품' },
    { code: 'electronics', name: '전자기기' },
    { code: 'food', name: '식품' },
    { code: 'other', name: '직접 입력' },
  ];

  // 문구만으로 확실하게 판정할 수 있는 품목만 자동 차단한다.
  const HARD_BANNED = [
    { category: '금전', keywords: ['현금', '상품권', '유가증권'] },
    { category: '귀중품', keywords: ['금괴', '은괴', '보석'] },
    { category: '인화성', keywords: ['라이터', '부탄가스', '페인트', '신나', '알코올 스프레이'] },
    { category: '배터리', keywords: ['보조배터리', '리튬배터리 단품'] },
    { category: '생물', keywords: ['살아있는 동물', '살아있는 식물'] },
    { category: '온도', keywords: ['냉장 식품', '냉동 식품', '냉장식품', '냉동식품'] },
    { category: '기타', keywords: ['주류', '의약품', '총포', '도검'] },
  ];

  // 짧거나 조건이 필요한 표현은 자동 거절하지 않고 운영 검토로 보낸다.
  const REVIEW_KEYWORDS = ['금', '은', '배터리', '동물', '식물', '냉장', '냉동'];

  global.DuduPolicy = Object.freeze({
    VERSION: '2026-08-06',
    BRANCHES,
    DESTINATIONS,
    ISLAND_AREAS,
    RATE_TABLE,
    ETA_BUSINESS_DAYS,
    STANDARD_STATUSES,
    DELIVERY_SERVICES,
    ITEM_CATEGORIES,
    HARD_BANNED,
    REVIEW_KEYWORDS,
  });
})(globalThis);
