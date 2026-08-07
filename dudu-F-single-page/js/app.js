(function () {
  'use strict';

  const policy = globalThis.DuduPolicy;
  const domain = globalThis.DuduDomain;
  const STORAGE_KEY = 'dudu-logistics.shipments.v2';
  const app = document.getElementById('app');
  const toast = document.getElementById('toast');
  let shipments = loadShipments();
  let submitting = false;
  let toastTimer = null;

  function loadShipments() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn('저장된 접수 데이터를 읽지 못했습니다.', error);
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(shipments));
    } catch (error) {
      console.warn('브라우저 저장소에 기록하지 못했습니다.', error);
      showToast('브라우저 저장이 차단되어 현재 화면에서만 유지됩니다.');
    }
    updateReviewCount();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatWon(value) {
    return Number(value).toLocaleString('ko-KR') + '원';
  }

  function formatNumber(value, digits = 1) {
    return Number(value).toLocaleString('ko-KR', { maximumFractionDigits: digits });
  }

  function formatDateTime(value) {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  }

  function makeId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return globalThis.crypto.randomUUID();
    }
    return `request-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function pageHead(eyebrow, title, description, action = '') {
    return `<div class="page-head">
      <div>
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="page-description">${escapeHtml(description)}</p>
      </div>
      ${action}
    </div>`;
  }

  function statusBadge(shipment) {
    if (shipment.review?.status === 'pending') return '<span class="badge review">운영 확인 필요</span>';
    if (shipment.review?.status === 'resolved') return '<span class="badge success">검토 완료</span>';
    return '<span class="badge success">정상</span>';
  }

  function updateReviewCount() {
    const count = shipments.filter((shipment) => shipment.review?.status === 'pending').length;
    document.getElementById('reviewCount').textContent = String(count);
  }

  function setActiveNav(route) {
    let active = 'home';
    if (route === '/shipments/new') active = 'new';
    else if (route === '/shipments') active = 'list';
    else if (route.startsWith('/shipments/')) active = 'list';
    else if (route === '/reviews') active = 'reviews';
    else if (route === '/policy') active = 'policy';
    document.querySelectorAll('.main-nav a').forEach((link) => {
      link.classList.toggle('active', link.dataset.route === active);
    });
  }

  function shipmentRows(rows) {
    if (rows.length === 0) {
      return '<tr><td colspan="8"><div class="empty-state"><strong>표시할 접수가 없습니다</strong>새 접수를 등록하거나 검색 조건을 바꿔보세요.</div></td></tr>';
    }
    return rows.map((shipment) => `<tr>
      <td><a class="tracking-link" href="#/shipments/${encodeURIComponent(shipment.trackingNo)}">${escapeHtml(shipment.trackingNo)}</a></td>
      <td>${escapeHtml(shipment.branch.name)}</td>
      <td>${escapeHtml(shipment.receiver.name)}</td>
      <td>${escapeHtml(shipment.item.name)}</td>
      <td>${escapeHtml(shipment.calculation.grade)}</td>
      <td>${formatWon(shipment.calculation.price)}</td>
      <td>${statusBadge(shipment)}</td>
      <td>${escapeHtml(domain.formatDate(shipment.acceptedAt))}</td>
    </tr>`).join('');
  }

  function shipmentTable(rows) {
    return `<div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>운송장</th><th>접수 지점</th><th>받는 분</th><th>물품</th><th>등급</th><th>요금</th><th>판정</th><th>접수일</th></tr></thead>
        <tbody id="shipmentRows">${shipmentRows(rows)}</tbody>
      </table>
    </div>`;
  }

  function renderDashboard() {
    const today = domain.formatDate(new Date());
    const todayCount = shipments.filter((shipment) => domain.formatDate(shipment.acceptedAt) === today).length;
    const pendingCount = shipments.filter((shipment) => shipment.review?.status === 'pending').length;
    const deliveredCount = shipments.filter((shipment) => shipment.status === '배송완료').length;
    const totalPrice = shipments.reduce((sum, shipment) => sum + Number(shipment.calculation.price || 0), 0);
    const recent = [...shipments].sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt)).slice(0, 5);

    app.innerHTML = `${pageHead('Dashboard', '오늘의 접수 흐름을 한눈에', '정상 접수와 운영 확인이 필요한 건을 분리해 확인합니다.', '<a class="button primary" href="#/shipments/new">+ 새 접수 시작</a>')}
      <section class="metric-grid" aria-label="접수 요약">
        <article class="metric-card"><div class="metric-label">오늘 접수</div><div class="metric-value">${todayCount}</div><div class="metric-note">${today}</div></article>
        <article class="metric-card attention"><div class="metric-label">운영 확인 필요</div><div class="metric-value">${pendingCount}</div><div class="metric-note">임의 확정하지 않은 접수</div></article>
        <article class="metric-card"><div class="metric-label">배송 완료</div><div class="metric-value">${deliveredCount}</div><div class="metric-note">표준 상태 기준</div></article>
        <article class="metric-card"><div class="metric-label">누적 접수 요금</div><div class="metric-value">${formatWon(totalPrice)}</div><div class="metric-note">현재 브라우저 저장 기준</div></article>
      </section>
      <section class="section-grid">
        <article class="card">
          <div class="card-head"><h2>최근 접수</h2><a href="#/shipments">전체 보기 →</a></div>
          ${recent.length ? shipmentTable(recent) : '<div class="empty-state"><strong>아직 접수 내역이 없습니다</strong>첫 접수를 등록하면 최근 내역이 표시됩니다.<div class="button-row" style="justify-content:center;margin-top:16px"><a class="button primary" href="#/shipments/new">새 접수</a></div></div>'}
        </article>
        <aside class="card">
          <div class="card-head"><h2>정책 적용 순서</h2></div>
          <ol class="workflow-list">
            <li><span class="workflow-number">1</span><div><strong>기계적 차단</strong><small>필수값·표준 목록·숫자 범위를 먼저 검사</small></div></li>
            <li><span class="workflow-number">2</span><div><strong>정책 판정</strong><small>금지 품목과 요금 규칙을 동일하게 적용</small></div></li>
            <li><span class="workflow-number">3</span><div><strong>운영 보류</strong><small>확정할 수 없는 값은 담당자 검토로 전달</small></div></li>
            <li><span class="workflow-number">4</span><div><strong>근거 기록</strong><small>원본·계산값·처리 이유를 함께 보존</small></div></li>
          </ol>
        </aside>
      </section>`;
  }

  function renderNewShipment() {
    const branchOptions = policy.BRANCHES.map((branch) => `<option value="${branch.code}">${escapeHtml(branch.name)} · ${escapeHtml(branch.hub)}</option>`).join('');
    const destinationOptions = policy.DESTINATIONS.map((area) => `<option value="${escapeHtml(area.name)}">${escapeHtml(area.name)} · ${escapeHtml(area.region)}</option>`).join('');

    app.innerHTML = `${pageHead('New shipment', '새 접수', '표준 입력값만 받고 계산값은 직접 수정할 수 없도록 구성했습니다.', '<a class="button" href="#/policy">적용 정책 보기</a>')}
      <div class="notice">현재 버전은 서버가 아닌 이 브라우저의 localStorage에 저장됩니다. 전사 운송장 중복 방지는 DB 연결 단계에서 최종 적용해야 합니다.</div>
      <div class="form-layout">
        <form id="shipmentForm" class="form-card" novalidate>
          <section class="form-section">
            <div class="section-title"><span>1</span><h2>접수 기본 정보</h2></div>
            <div class="field-grid">
              <div class="field">
                <label for="branchCode">접수 지점 <b class="required">*</b></label>
                <select id="branchCode" name="branchCode" required><option value="">지점을 선택하세요</option>${branchOptions}</select>
                <small>미등록 지점 코드 00은 발급하지 않습니다.</small>
              </div>
              <div class="field">
                <label for="destination">도착 지역 <b class="required">*</b></label>
                <select id="destination" name="destination" required><option value="">표준 지역을 선택하세요</option>${destinationOptions}</select>
                <small>선택값으로 일반·제주·도서산간을 판정합니다.</small>
              </div>
              <div class="field">
                <label for="senderName">보내는 분 이름 <b class="required">*</b></label>
                <input id="senderName" name="senderName" autocomplete="name" maxlength="40" placeholder="예: 김민준">
              </div>
              <div class="field">
                <label for="receiverName">받는 분 이름 <b class="required">*</b></label>
                <input id="receiverName" name="receiverName" maxlength="40" placeholder="예: 이서연">
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title"><span>2</span><h2>물품 확인</h2></div>
            <div class="field-grid">
              <div class="field full">
                <label for="itemName">물품명 <b class="required">*</b></label>
                <input id="itemName" name="itemName" maxlength="80" placeholder="예: 이불">
                <small>확실한 금지 품목은 차단하고, 애매한 표현은 운영 확인으로 보냅니다.</small>
              </div>
              <div class="field">
                <label for="declaredValue">신고 가액 (원)</label>
                <input type="number" id="declaredValue" name="declaredValue" min="0" step="1000" placeholder="시계는 필수 확인">
                <small>50만원 초과 시계 판정에 사용합니다.</small>
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="section-title"><span>3</span><h2>무게와 크기</h2></div>
            <div class="field-grid">
              <div class="field">
                <label for="weight">실제 무게 (kg) <b class="required">*</b></label>
                <input type="number" id="weight" name="weight" min="0.01" step="0.01" placeholder="예: 3">
              </div>
              <div class="field full">
                <label>가로 × 세로 × 높이 (cm) <b class="required">*</b></label>
                <div class="dimension-grid">
                  <input type="number" id="width" name="width" min="0.1" step="0.1" aria-label="가로" placeholder="가로">
                  <input type="number" id="height" name="height" min="0.1" step="0.1" aria-label="세로" placeholder="세로">
                  <input type="number" id="depth" name="depth" min="0.1" step="0.1" aria-label="높이" placeholder="높이">
                </div>
              </div>
            </div>
            <div class="policy-note">청구 무게와 요금은 입력하지 않습니다. 실제 무게와 부피 무게 중 큰 값으로 자동 계산합니다.</div>
          </section>

          <div class="form-actions">
            <button type="reset" class="button">입력 초기화</button>
            <button type="submit" id="submitButton" class="button primary" disabled>계산 확인 후 접수</button>
          </div>
        </form>

        <aside class="preview-card" aria-live="polite">
          <div class="preview-head"><span>실시간 정책 판정</span><strong>접수 전 계산 결과</strong></div>
          <div id="calculationPreview" class="preview-body"></div>
        </aside>
      </div>`;

    const form = document.getElementById('shipmentForm');
    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);
    form.addEventListener('reset', () => setTimeout(updatePreview));
    form.addEventListener('submit', submitShipment);
    updatePreview();
  }

  function collectForm() {
    return {
      branchCode: document.getElementById('branchCode').value,
      destination: document.getElementById('destination').value,
      senderName: document.getElementById('senderName').value.trim(),
      receiverName: document.getElementById('receiverName').value.trim(),
      itemName: document.getElementById('itemName').value.trim(),
      declaredValue: document.getElementById('declaredValue').value,
      weight: document.getElementById('weight').value,
      width: document.getElementById('width').value,
      height: document.getElementById('height').value,
      depth: document.getElementById('depth').value,
    };
  }

  function validateForm(values) {
    const errors = [];
    const branch = domain.findBranch(values.branchCode);
    const destination = domain.findDestination(values.destination);
    if (!branch) errors.push('접수 지점을 표준 목록에서 선택하세요.');
    if (!destination) errors.push('도착 지역을 표준 목록에서 선택하세요.');
    if (!values.senderName) errors.push('보내는 분 이름을 입력하세요.');
    if (!values.receiverName) errors.push('받는 분 이름을 입력하세요.');
    if (!values.itemName) errors.push('물품명을 입력하세요.');

    const itemDecision = domain.evaluateItem(values.itemName, values.declaredValue);
    if (itemDecision.outcome === 'blocked') errors.push(itemDecision.reason);
    const calculation = domain.calculate(values);
    if (!calculation.ok) errors.push(...calculation.errors);
    return { errors: [...new Set(errors)], branch, destination, itemDecision, calculation };
  }

  function updatePreview() {
    const preview = document.getElementById('calculationPreview');
    if (!preview) return;
    const values = collectForm();
    const result = validateForm(values);
    const submitButton = document.getElementById('submitButton');
    const hasAnyValue = Object.values(values).some(Boolean);

    if (!hasAnyValue) {
      preview.innerHTML = '<div class="result-state pending"><strong>입력 대기</strong>필수 정보를 입력하면 금지 품목부터 순서대로 판정합니다.</div>';
      submitButton.disabled = true;
      return;
    }

    const itemClass = result.itemDecision.outcome === 'blocked' ? 'blocked' : result.itemDecision.outcome === 'review' ? 'review' : result.itemDecision.outcome === 'clear' ? 'success' : 'pending';
    let html = `<div class="result-state ${itemClass}"><strong>1. 금지 품목 검사</strong>${escapeHtml(result.itemDecision.reason)}</div>`;

    if (result.calculation.ok) {
      const eta = domain.addBusinessDays(new Date(), policy.ETA_BUSINESS_DAYS[result.calculation.region]);
      html += `<ul class="calc-list">
        <li><span>2. 부피 무게</span><strong>${formatNumber(result.calculation.width)} × ${formatNumber(result.calculation.height)} × ${formatNumber(result.calculation.depth)} ÷ 6000<br>${formatNumber(result.calculation.volumeWeight, 2)}kg</strong></li>
        <li><span>3. 요금 무게</span><strong>${formatNumber(result.calculation.billedWeight, 2)}kg</strong></li>
        <li><span>4. 세 변의 합</span><strong>${formatNumber(result.calculation.dimensionSum)}cm</strong></li>
        <li><span>5. 크기 등급</span><strong>${escapeHtml(result.calculation.grade)}</strong></li>
        <li><span>6. 배송 권역</span><strong>${escapeHtml(result.calculation.region)}</strong></li>
        <li><span>7. 도착 예정일</span><strong>${escapeHtml(domain.formatDate(eta))}</strong></li>
      </ul>
      <div class="price-box"><span>최종 접수 요금</span><strong>${formatWon(result.calculation.price)}</strong></div>`;
    }

    if (result.errors.length > 0) {
      html += `<ul class="error-list">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>`;
    } else if (result.itemDecision.outcome === 'review') {
      html += '<div class="policy-note">이 접수는 저장할 수 있지만 “운영 확인 필요” 상태로 분리됩니다.</div>';
    }

    preview.innerHTML = html;
    submitButton.disabled = result.errors.length > 0 || submitting;
    submitButton.textContent = result.itemDecision.outcome === 'review' ? '보류 상태로 접수' : '접수 완료';
  }

  function submitShipment(event) {
    event.preventDefault();
    if (submitting) return;
    const values = collectForm();
    const result = validateForm(values);
    if (result.errors.length > 0) {
      updatePreview();
      showToast('입력값을 다시 확인해 주세요.');
      return;
    }

    submitting = true;
    updatePreview();
    const acceptedAt = new Date();
    const trackingNo = domain.nextTrackingNo(result.branch.code, shipments);
    if (shipments.some((shipment) => shipment.trackingNo === trackingNo)) {
      submitting = false;
      showToast('운송장 중복을 발견했습니다. 다시 시도해 주세요.');
      return;
    }
    const eta = domain.addBusinessDays(acceptedAt, policy.ETA_BUSINESS_DAYS[result.calculation.region]);
    const isReview = result.itemDecision.outcome === 'review';
    const record = {
      requestId: makeId(),
      trackingNo,
      acceptedAt: acceptedAt.toISOString(),
      policyVersion: policy.VERSION,
      status: '집화처리',
      statusHistory: [{ status: '집화처리', changedAt: acceptedAt.toISOString(), source: '신규 접수' }],
      branch: { code: result.branch.code, name: result.branch.name, hub: result.branch.hub },
      sender: { name: values.senderName },
      receiver: { name: values.receiverName, area: result.destination.name, region: result.destination.region },
      item: { name: values.itemName, declaredValue: domain.nonNegativeNumber(values.declaredValue) },
      raw: { ...values },
      calculation: {
        weight: result.calculation.weight,
        width: result.calculation.width,
        height: result.calculation.height,
        depth: result.calculation.depth,
        volumeWeight: Math.round(result.calculation.volumeWeight * 100) / 100,
        billedWeight: Math.round(result.calculation.billedWeight * 100) / 100,
        dimensionSum: Math.round(result.calculation.dimensionSum * 10) / 10,
        grade: result.calculation.grade,
        region: result.calculation.region,
        price: result.calculation.price,
        etaDate: domain.formatDate(eta),
      },
      review: isReview
        ? { status: 'pending', reason: result.itemDecision.reason, reviewer: '', note: '', reviewedAt: null }
        : { status: 'none', reason: '', reviewer: '', note: '', reviewedAt: null },
    };

    shipments.push(record);
    persist();
    submitting = false;
    location.hash = `#/shipments/${encodeURIComponent(trackingNo)}`;
    showToast(isReview ? '보류 상태로 접수했습니다.' : '접수가 완료됐습니다.');
  }

  function renderShipmentList() {
    const sorted = [...shipments].sort((a, b) => new Date(b.acceptedAt) - new Date(a.acceptedAt));
    app.innerHTML = `${pageHead('Shipments', '접수 목록', '운송장·이름·물품으로 검색하고 정책 판정 상태를 확인합니다.', '<a class="button primary" href="#/shipments/new">+ 새 접수</a>')}
      <div class="toolbar"><input id="shipmentSearch" type="search" placeholder="운송장, 받는 분, 물품 검색" aria-label="접수 검색"></div>
      ${shipmentTable(sorted)}`;

    document.getElementById('shipmentSearch').addEventListener('input', (event) => {
      const query = event.target.value.trim().toLowerCase();
      const filtered = sorted.filter((shipment) => [
        shipment.trackingNo, shipment.sender.name, shipment.receiver.name,
        shipment.item.name, shipment.branch.name, shipment.receiver.area,
      ].some((value) => String(value).toLowerCase().includes(query)));
      document.getElementById('shipmentRows').innerHTML = shipmentRows(filtered);
    });
  }

  function renderShipmentDetail(trackingNo) {
    const shipment = shipments.find((item) => item.trackingNo === trackingNo);
    if (!shipment) {
      renderNotFound('해당 운송장을 찾을 수 없습니다.');
      return;
    }
    const statusOptions = policy.STANDARD_STATUSES.map((status) => `<option value="${escapeHtml(status)}" ${status === shipment.status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('');
    const reviewBlock = shipment.review?.status === 'pending'
      ? `<div class="result-state review"><strong>운영 확인 필요</strong>${escapeHtml(shipment.review.reason)}<br><a href="#/reviews">보류 검토 화면에서 처리하기 →</a></div>`
      : shipment.review?.status === 'resolved'
        ? `<div class="result-state success"><strong>검토 완료 · ${escapeHtml(shipment.review.reviewer || '담당자 미기록')}</strong>${escapeHtml(shipment.review.note)}</div>`
        : '<div class="result-state success"><strong>정상 접수</strong>자동 차단 및 계산 규칙을 통과했습니다.</div>';

    app.innerHTML = `${pageHead('Shipment detail', '접수 상세', '입력 원본과 정책에 따라 계산된 값을 함께 확인합니다.', '<div class="button-row"><a class="button" href="#/shipments">← 목록</a><a class="button primary" href="#/shipments/new">+ 새 접수</a></div>')}
      <div class="detail-grid">
        <section class="card">
          <div class="tracking-number"><small>운송장 번호</small><strong>${escapeHtml(shipment.trackingNo)}</strong></div>
          ${reviewBlock}
          <dl class="detail-list">
            <div><dt>접수 일시</dt><dd>${escapeHtml(formatDateTime(shipment.acceptedAt))}</dd></div>
            <div><dt>적용 정책</dt><dd>${escapeHtml(shipment.policyVersion)}</dd></div>
            <div><dt>접수 지점</dt><dd>${escapeHtml(shipment.branch.name)} (${escapeHtml(shipment.branch.code)})</dd></div>
            <div><dt>허브</dt><dd>${escapeHtml(shipment.branch.hub)}</dd></div>
            <div><dt>보내는 분</dt><dd>${escapeHtml(shipment.sender.name)}</dd></div>
            <div><dt>받는 분</dt><dd>${escapeHtml(shipment.receiver.name)}</dd></div>
            <div><dt>도착 지역</dt><dd>${escapeHtml(shipment.receiver.area)} · ${escapeHtml(shipment.receiver.region)}</dd></div>
            <div><dt>물품</dt><dd>${escapeHtml(shipment.item.name)}</dd></div>
            <div><dt>실제 무게</dt><dd>${formatNumber(shipment.calculation.weight, 2)}kg</dd></div>
            <div><dt>부피 무게</dt><dd>${formatNumber(shipment.calculation.volumeWeight, 2)}kg</dd></div>
            <div><dt>요금 무게</dt><dd>${formatNumber(shipment.calculation.billedWeight, 2)}kg</dd></div>
            <div><dt>세 변의 합</dt><dd>${formatNumber(shipment.calculation.dimensionSum)}cm</dd></div>
            <div><dt>크기 등급</dt><dd>${escapeHtml(shipment.calculation.grade)}</dd></div>
            <div><dt>도착 예정일</dt><dd>${escapeHtml(shipment.calculation.etaDate)}</dd></div>
          </dl>
        </section>
        <aside class="card">
          <div class="card-head"><h2>정산 및 상태</h2></div>
          <div class="price-box"><span>접수 요금</span><strong>${formatWon(shipment.calculation.price)}</strong></div>
          <div style="margin-top:18px">
            <label for="shipmentStatus" style="display:block;margin-bottom:7px;font-size:13px;font-weight:800">표준 배송 상태</label>
            <div class="status-control"><select id="shipmentStatus" class="status-select">${statusOptions}</select><button id="saveStatus" class="button">저장</button></div>
          </div>
          <div class="audit-box"><strong>원본 보존</strong><br>입력 원본과 자동 계산값을 분리해 저장했습니다. 계산값은 상세 화면에서 직접 수정할 수 없습니다.<br><br><strong>최근 상태 변경</strong><br>${escapeHtml(formatDateTime((shipment.statusHistory || []).at(-1)?.changedAt || shipment.acceptedAt))}</div>
        </aside>
      </div>`;

    document.getElementById('saveStatus').addEventListener('click', () => {
      const status = document.getElementById('shipmentStatus').value;
      if (!policy.STANDARD_STATUSES.includes(status)) return;
      if (shipment.status === status) {
        showToast('이미 같은 배송 상태입니다.');
        return;
      }
      shipment.status = status;
      shipment.statusUpdatedAt = new Date().toISOString();
      shipment.statusHistory = shipment.statusHistory || [];
      shipment.statusHistory.push({ status, changedAt: shipment.statusUpdatedAt, source: '상세 화면 변경' });
      persist();
      showToast('표준 배송 상태를 저장했습니다.');
    });
  }

  function renderReviews() {
    const pending = shipments.filter((shipment) => shipment.review?.status === 'pending');
    app.innerHTML = `${pageHead('Review queue', '보류 검토', '자료만으로 확정할 수 없는 접수를 삭제하거나 덮어쓰지 않고 운영자가 확인합니다.', '<a class="button" href="#/policy">판정 정책 보기</a>')}
      ${pending.length === 0
        ? '<div class="card empty-state"><strong>검토할 접수가 없습니다</strong>애매한 품목이나 운영 판단이 필요한 접수는 여기에 모입니다.</div>'
        : `<div class="review-grid">${pending.map((shipment) => `<article class="review-card">
            <span class="badge review">보류</span>
            <h2><a class="tracking-link" href="#/shipments/${encodeURIComponent(shipment.trackingNo)}">${escapeHtml(shipment.trackingNo)}</a></h2>
            <p>${escapeHtml(shipment.review.reason)}</p>
            <div class="review-meta">
              <div><small>물품 원본</small><strong>${escapeHtml(shipment.raw.itemName)}</strong></div>
              <div><small>신고 가액</small><strong>${shipment.item.declaredValue === null ? '미입력' : formatWon(shipment.item.declaredValue)}</strong></div>
              <div><small>접수 지점</small><strong>${escapeHtml(shipment.branch.name)}</strong></div>
              <div><small>접수 일시</small><strong>${escapeHtml(formatDateTime(shipment.acceptedAt))}</strong></div>
            </div>
            <label for="reviewer-${escapeHtml(shipment.requestId)}" style="display:block;margin-bottom:6px;font-size:12px;font-weight:800">검토 담당자</label>
            <input id="reviewer-${escapeHtml(shipment.requestId)}" class="review-note" data-reviewer-id="${escapeHtml(shipment.requestId)}" style="min-height:44px;margin-bottom:9px" placeholder="예: 이가영">
            <label for="note-${escapeHtml(shipment.requestId)}" style="display:block;margin-bottom:6px;font-size:12px;font-weight:800">확인 근거 및 처리 내용</label>
            <textarea id="note-${escapeHtml(shipment.requestId)}" class="review-note" data-note-id="${escapeHtml(shipment.requestId)}" placeholder="확인한 자료와 판단 근거를 남기세요"></textarea>
            <div class="review-actions"><button class="button primary" data-resolve-id="${escapeHtml(shipment.requestId)}">검토 완료</button></div>
          </article>`).join('')}</div>`}`;

    document.querySelectorAll('[data-resolve-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const requestId = button.dataset.resolveId;
        const reviewer = document.getElementById(`reviewer-${requestId}`).value.trim();
        const note = document.getElementById(`note-${requestId}`).value.trim();
        if (!reviewer || !note) {
          showToast('검토 담당자와 판단 근거를 모두 입력해 주세요.');
          return;
        }
        const shipment = shipments.find((item) => item.requestId === requestId);
        if (!shipment) return;
        shipment.review = { ...shipment.review, status: 'resolved', reviewer, note, reviewedAt: new Date().toISOString() };
        persist();
        renderReviews();
        showToast('검토 결과와 근거를 저장했습니다.');
      });
    });
  }

  function renderPolicy() {
    const rateRows = policy.RATE_TABLE.map((row) => `<tr><td><strong>${escapeHtml(row.grade)}</strong></td><td>${row.maxSum}cm 이하</td><td>${row.maxWeight}kg 이하</td><td>${formatWon(row.price.일반)}</td><td>${formatWon(row.price.제주)}</td><td>${formatWon(row.price.도서산간)}</td></tr>`).join('');
    app.innerHTML = `${pageHead('Policy', '데이터 처리 정책', `정책서 ${policy.VERSION} 기준으로 화면에 적용한 규칙입니다.`, '<a class="button primary" href="#/shipments/new">정책대로 접수하기</a>')}
      <section class="policy-grid">
        <article class="policy-layer"><span>1</span><h2>기계적 차단</h2><p>필수값, 숫자 범위, 표준 지점·지역 선택, 확실한 금지 품목을 화면에서 차단합니다.</p></article>
        <article class="policy-layer"><span>2</span><h2>정책 판정</h2><p>부피 무게, 요금 무게, 등급, 권역, 요금과 도착 예정일을 같은 규칙으로 계산합니다.</p></article>
        <article class="policy-layer"><span>3</span><h2>운영 확인</h2><p>중복이나 애매한 표현은 임의로 확정하지 않고 원본과 사유를 보존한 채 보류합니다.</p></article>
      </section>
      <section class="card policy-section">
        <div class="card-head"><h2>요금표</h2><span class="badge neutral">4등급 × 3권역</span></div>
        <div class="table-wrap"><table class="rate-table"><thead><tr><th>등급</th><th>세 변의 합</th><th>요금 무게</th><th>일반</th><th>제주</th><th>도서산간</th></tr></thead><tbody>${rateRows}</tbody></table></div>
      </section>
      <section class="section-grid">
        <article class="card"><div class="card-head"><h2>접수 계산 순서</h2></div><ol class="workflow-list">
          <li><span class="workflow-number">1</span><div><strong>금지 품목 검사</strong><small>확실하면 거절, 애매하면 운영 확인</small></div></li>
          <li><span class="workflow-number">2</span><div><strong>부피·요금 무게 계산</strong><small>가로×세로×높이÷6000, 실제 무게와 큰 값 사용</small></div></li>
          <li><span class="workflow-number">3</span><div><strong>등급 및 한도 판정</strong><small>크기와 무게 중 하나라도 넘으면 다음 등급</small></div></li>
          <li><span class="workflow-number">4</span><div><strong>요금·예정일 계산</strong><small>권역별 요금과 영업일 적용</small></div></li>
        </ol></article>
        <article class="card"><div class="card-head"><h2>표준값</h2></div>
          <p><strong>접수 지점</strong><br>${policy.BRANCHES.map((item) => escapeHtml(item.name)).join(' · ')}</p>
          <p><strong>도서산간</strong><br>${policy.ISLAND_AREAS.map(escapeHtml).join(' · ')}</p>
          <p style="margin-bottom:0"><strong>배송 상태</strong><br>${policy.STANDARD_STATUSES.map(escapeHtml).join(' · ')}</p>
        </article>
      </section>`;
  }

  function renderNotFound(message = '요청한 페이지를 찾을 수 없습니다.') {
    app.innerHTML = `<div class="card empty-state"><strong>${escapeHtml(message)}</strong><a class="button primary" href="#/" style="margin-top:14px">대시보드로 이동</a></div>`;
  }

  function route() {
    const raw = location.hash.slice(1) || '/';
    const path = raw.split('?')[0];
    setActiveNav(path);
    updateReviewCount();

    if (path === '/') renderDashboard();
    else if (path === '/shipments/new') renderNewShipment();
    else if (path === '/shipments') renderShipmentList();
    else if (path.startsWith('/shipments/')) renderShipmentDetail(decodeURIComponent(path.slice('/shipments/'.length)));
    else if (path === '/reviews') renderReviews();
    else if (path === '/policy') renderPolicy();
    else renderNotFound();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  window.addEventListener('hashchange', route);
  route();
})();
