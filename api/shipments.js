import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import {
  ShipmentValidationError,
  toDatabaseRecord,
  validateAndNormalizeShipment,
  validateStatusUpdate,
} from './shipment-model.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
function createVirtualTrackingNo(branchCode) {
  const randomSuffix = String(randomInt(0, 100_000_000)).padStart(8, '0');
  return `${branchCode}${randomSuffix}`;
}

function isTrackingNumberConflict(error) {
  return error?.code === '23505' && String(error.message).includes('tracking_no');
}

async function findByRequestId(requestId) {
  const { data } = await supabase
    .from('shipments')
    .select('*')
    .eq('request_id', requestId)
    .maybeSingle();
  return data;
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const normalized = validateAndNormalizeShipment(req.body);
      const existing = await findByRequestId(normalized.requestId);
      if (existing) return res.status(200).json(existing);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const trackingNo = createVirtualTrackingNo(normalized.branch.code);
        const dbRecord = toDatabaseRecord(normalized, trackingNo);
        const { data, error } = await supabase
          .from('shipments')
          .insert([dbRecord])
          .select()
          .single();

        if (!error) {
          return res.status(200).json(data);
        }
        if (error.code === '23505') {
          const duplicateRequest = await findByRequestId(normalized.requestId);
          if (duplicateRequest) return res.status(200).json(duplicateRequest);
        }
        if (!isTrackingNumberConflict(error)) {
          return res.status(400).json({ error: error.message });
        }
      }

      return res.status(409).json({ error: '운송장 번호 발급이 겹쳤습니다. 다시 시도해 주세요.' });
    } catch (err) {
      if (err instanceof ShipmentValidationError) {
        return res.status(400).json({ error: err.message, errors: err.errors });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .order('accepted_at', { ascending: false })
        .limit(500);

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json(data);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    try {
      const { trackingNo, status } = validateStatusUpdate(req.body);
      const { data, error } = await supabase
        .from('shipments')
        .update({ status, normalized_status: status })
        .eq('tracking_no', trackingNo)
        .select()
        .single();

      if (error) return res.status(400).json({ error: error.message });
      return res.status(200).json(data);
    } catch (err) {
      if (err instanceof ShipmentValidationError) {
        return res.status(400).json({ error: err.message, errors: err.errors });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
