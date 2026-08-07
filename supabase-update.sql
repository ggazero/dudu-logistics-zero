-- 두두택배 정책 반영 DB 업데이트
-- 작성일: 2026-08-07
-- 사용법: Supabase > SQL Editor > New query에 전체 붙여넣기 > Run
-- 주의: 기존 데이터를 삭제하지 않습니다.

begin;

create extension if not exists pgcrypto;

-- 1. 운송장 중복이 있으면 임의로 삭제하지 않고 실행을 중단합니다.
do $$
begin
  if exists (
    select 1
    from shipments
    where tracking_no is not null
    group by tracking_no
    having count(*) > 1
  ) then
    raise exception '중복 운송장 번호가 있습니다. 중복 데이터를 먼저 확인해 주세요.';
  end if;
end
$$;

-- 2. 새 화면과 정책 기록에 필요한 칸을 추가합니다.
alter table shipments add column if not exists request_id uuid;
alter table shipments add column if not exists accepted_at timestamptz;
alter table shipments add column if not exists updated_at timestamptz;
alter table shipments add column if not exists branch_code text;
alter table shipments add column if not exists branch_name text;
alter table shipments add column if not exists volume_weight_kg numeric(10, 2);
alter table shipments add column if not exists dimension_sum_cm numeric(10, 2);
alter table shipments add column if not exists declared_value integer;
alter table shipments add column if not exists policy_version text;
alter table shipments add column if not exists raw_input jsonb;

-- 원본을 덮어쓰지 않고 비교하기 위한 칸입니다.
alter table shipments add column if not exists region_type_original text;
alter table shipments add column if not exists status_original text;
alter table shipments add column if not exists billed_weight_kg_original numeric(10, 2);
alter table shipments add column if not exists normalized_region_type text;
alter table shipments add column if not exists normalized_status text;
alter table shipments add column if not exists calculated_billed_weight_kg numeric(10, 2);

-- 보류 검토에 필요한 칸입니다.
alter table shipments add column if not exists review_status text;
alter table shipments add column if not exists review_reason text;
alter table shipments add column if not exists reviewer text;
alter table shipments add column if not exists review_note text;
alter table shipments add column if not exists reviewed_at timestamptz;

-- 소수점 크기도 저장할 수 있게 바꿉니다.
alter table shipments alter column width_cm type numeric(10, 2) using width_cm::numeric;
alter table shipments alter column height_cm type numeric(10, 2) using height_cm::numeric;
alter table shipments alter column depth_cm type numeric(10, 2) using depth_cm::numeric;

-- 3. 기존 행을 보존하면서 새 관리 칸을 채웁니다.
update shipments
set
  request_id = coalesce(request_id, gen_random_uuid()),
  accepted_at = coalesce(accepted_at, created_at, now()),
  updated_at = coalesce(updated_at, created_at, now()),
  policy_version = coalesce(policy_version, '2026-08-06'),
  review_status = coalesce(review_status, 'none'),
  raw_input = coalesce(
    raw_input,
    jsonb_strip_nulls(
      jsonb_build_object(
        'tracking_no', tracking_no,
        'sender_name', sender_name,
        'receiver_name', receiver_name,
        'receiver_area', receiver_area,
        'region_type', region_type,
        'item_name', item_name,
        'weight_kg', weight_kg,
        'width_cm', width_cm,
        'height_cm', height_cm,
        'depth_cm', depth_cm,
        'billed_weight_kg', billed_weight_kg,
        'size_grade', size_grade,
        'price', price,
        'eta_date', eta_date,
        'status', status
      )
    )
  ),
  region_type_original = coalesce(region_type_original, region_type),
  status_original = coalesce(status_original, status),
  billed_weight_kg_original = coalesce(billed_weight_kg_original, billed_weight_kg),
  branch_code = coalesce(branch_code, left(tracking_no, 2)),
  branch_name = coalesce(
    branch_name,
    case left(tracking_no, 2)
      when '11' then '서울지점'
      when '12' then '용산지점'
      when '21' then '대전지점'
      when '31' then '진주지점'
      when '32' then '거제지점'
      when '41' then '울산지점'
      else null
    end
  ),
  volume_weight_kg = coalesce(
    volume_weight_kg,
    round((width_cm * height_cm * depth_cm) / 6000.0, 2)
  ),
  dimension_sum_cm = coalesce(
    dimension_sum_cm,
    width_cm + height_cm + depth_cm
  ),
  calculated_billed_weight_kg = coalesce(
    calculated_billed_weight_kg,
    greatest(weight_kg, round((width_cm * height_cm * depth_cm) / 6000.0, 2))
  ),
  normalized_region_type = coalesce(
    normalized_region_type,
    case
      when receiver_area = '제주' then '제주'
      when receiver_area in ('울릉도', '백령도', '흑산도', '거문도', '추자도') then '도서산간'
      when receiver_area is not null then '일반'
      else null
    end
  ),
  normalized_status = coalesce(
    normalized_status,
    case
      when status in ('집화처리', '간선상차', '간선하차', '배송출발', '배송완료', '미배송', '반품') then status
      when status = '접수' then '집화처리'
      else null
    end
  );

alter table shipments alter column request_id set default gen_random_uuid();
alter table shipments alter column request_id set not null;
alter table shipments alter column accepted_at set default now();
alter table shipments alter column accepted_at set not null;
alter table shipments alter column updated_at set default now();
alter table shipments alter column updated_at set not null;
alter table shipments alter column policy_version set default '2026-08-06';
alter table shipments alter column review_status set default 'none';
alter table shipments alter column status set default '집화처리';

-- 4. 중복과 잘못된 새 입력을 DB에서도 막습니다.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shipments_request_id_key') then
    alter table shipments add constraint shipments_request_id_key unique (request_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'unique_tracking_no') then
    alter table shipments add constraint unique_tracking_no unique (tracking_no);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_tracking_no_format_check') then
    alter table shipments
      add constraint shipments_tracking_no_format_check
      check (tracking_no is not null and tracking_no ~ '^[0-9]{10}$') not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_region_type_check') then
    alter table shipments
      add constraint shipments_region_type_check
      check (region_type in ('일반', '제주', '도서산간')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_size_grade_check') then
    alter table shipments
      add constraint shipments_size_grade_check
      check (size_grade in ('극소형', '소형', '중형', '대형')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_status_check') then
    alter table shipments
      add constraint shipments_status_check
      check (status in ('집화처리', '간선상차', '간선하차', '배송출발', '배송완료', '미배송', '반품')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_review_status_check') then
    alter table shipments
      add constraint shipments_review_status_check
      check (review_status in ('none', 'pending', 'resolved')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'shipments_positive_measurements_check') then
    alter table shipments
      add constraint shipments_positive_measurements_check
      check (
        weight_kg > 0
        and width_cm > 0
        and height_cm > 0
        and depth_cm > 0
        and billed_weight_kg > 0
        and price >= 0
      ) not valid;
  end if;
end
$$;

create index if not exists shipments_accepted_at_idx on shipments (accepted_at desc);
create index if not exists shipments_review_status_idx on shipments (review_status);
create index if not exists shipments_status_idx on shipments (status);

-- 관리자 실습 화면에서 배송 상태만 갱신할 수 있게 합니다.
-- 실사용 전에는 로그인 사용자 역할을 확인하는 정책으로 교체해야 합니다.
drop policy if exists "anon update shipment status" on shipments;
revoke update on shipments from anon;
grant update (status, normalized_status) on shipments to anon;
create policy "anon update shipment status" on shipments
  for update to anon
  using (true)
  with check (status in ('집화처리', '간선상차', '간선하차', '배송출발', '배송완료', '미배송', '반품'));

-- 5. 배송 상태가 바뀔 때마다 이전 상태와 새 상태를 따로 남깁니다.
create table if not exists shipment_status_history (
  id bigint generated always as identity primary key,
  shipment_id bigint not null references shipments(id) on delete cascade,
  previous_status text,
  new_status text not null,
  changed_at timestamptz not null default now(),
  changed_by text,
  reason text
);

alter table shipment_status_history enable row level security;

create index if not exists shipment_status_history_shipment_id_idx
  on shipment_status_history (shipment_id, changed_at desc);

create or replace function log_shipment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into shipment_status_history (shipment_id, previous_status, new_status, changed_by, reason)
    values (new.id, null, new.status, 'system', '신규 접수');
  elsif old.status is distinct from new.status then
    insert into shipment_status_history (shipment_id, previous_status, new_status, changed_by, reason)
    values (new.id, old.status, new.status, 'system', '배송 상태 변경');
  end if;
  return new;
end;
$$;

drop trigger if exists shipments_status_history_trigger on shipments;
create trigger shipments_status_history_trigger
after insert or update of status on shipments
for each row execute function log_shipment_status_change();

-- 6. 수정 시각을 자동으로 갱신합니다.
create or replace function set_shipments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shipments_updated_at_trigger on shipments;
create trigger shipments_updated_at_trigger
before update on shipments
for each row execute function set_shipments_updated_at();

commit;

-- 실행 후 아래 두 쿼리로 확인하세요.
select tracking_no, branch_name, region_type, normalized_region_type,
       size_grade, status, review_status, policy_version
from shipments
order by accepted_at desc
limit 10;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'shipments'
order by ordinal_position;
