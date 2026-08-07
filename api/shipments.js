import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const BRANCH_CODES = new Set(['11', '12', '21', '31', '32', '41']);

function createVirtualTrackingNo(branchCode) {
  const randomSuffix = String(randomInt(0, 100_000_000)).padStart(8, '0');
  return `${branchCode}${randomSuffix}`;
}

function transformRecord(appRecord, trackingNo) {
  return {
    tracking_no: trackingNo,
    request_id: appRecord.requestId,
    accepted_at: appRecord.acceptedAt,
    branch_code: appRecord.branch.code,
    branch_name: appRecord.branch.name,
    sender_name: appRecord.sender.name,
    receiver_name: appRecord.receiver.name,
    receiver_area: appRecord.receiver.area,
    region_type: appRecord.calculation.region,
    item_name: appRecord.item.name,
    weight_kg: appRecord.calculation.weight,
    width_cm: appRecord.calculation.width,
    height_cm: appRecord.calculation.height,
    depth_cm: appRecord.calculation.depth,
    billed_weight_kg: appRecord.calculation.billedWeight,
    volume_weight_kg: appRecord.calculation.volumeWeight,
    dimension_sum_cm: appRecord.calculation.dimensionSum,
    calculated_billed_weight_kg: appRecord.calculation.billedWeight,
    size_grade: appRecord.calculation.grade,
    declared_value: appRecord.item.declaredValue,
    price: appRecord.calculation.price,
    eta_date: appRecord.calculation.etaDate,
    status: appRecord.status,
    normalized_region_type: appRecord.calculation.region,
    normalized_status: appRecord.status,
    policy_version: appRecord.policyVersion,
    raw_input: appRecord.raw,
    review_status: appRecord.review?.status || 'none',
    review_reason: appRecord.review?.reason || null,
  };
}

function isTrackingNumberConflict(error) {
  return error?.code === '23505' && String(error.message).includes('tracking_no');
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const branchCode = String(req.body?.branch?.code || '');
      if (!BRANCH_CODES.has(branchCode)) {
        return res.status(400).json({ error: '등록된 접수 지점 코드가 필요합니다.' });
      }

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const trackingNo = createVirtualTrackingNo(branchCode);
        const dbRecord = transformRecord(req.body, trackingNo);
        const { data, error } = await supabase
          .from('shipments')
          .insert([dbRecord])
          .select()
          .single();

        if (!error) {
          return res.status(200).json(data);
        }
        if (!isTrackingNumberConflict(error)) {
          return res.status(400).json({ error: error.message });
        }
      }

      return res.status(409).json({ error: '운송장 번호 발급이 겹쳤습니다. 다시 시도해 주세요.' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
