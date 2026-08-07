-- 관리자 실습 화면의 배송 상태 저장 연결
-- 사용법: Supabase > SQL Editor > New query에 전체 붙여넣기 > Run
-- 기존 접수 데이터는 삭제하지 않습니다.

begin;

revoke update on shipments from anon;
grant update (status, normalized_status) on shipments to anon;

drop policy if exists "anon update shipment status" on shipments;
create policy "anon update shipment status" on shipments
  for update to anon
  using (true)
  with check (
    status in ('집화처리', '간선상차', '간선하차', '배송출발', '배송완료', '미배송', '반품')
  );

commit;

-- 실행 후 정책이 보이면 완료입니다.
select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'shipments'
order by policyname;
