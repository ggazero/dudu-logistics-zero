import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function transformRecord(appRecord) {
  return {
    tracking_no: appRecord.trackingNo,
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
    size_grade: appRecord.calculation.grade,
    price: appRecord.calculation.price,
    eta_date: appRecord.calculation.etaDate,
    status: appRecord.status,
  };
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const dbRecord = transformRecord(req.body);
      const { data, error } = await supabase
        .from('shipments')
        .insert([dbRecord])
        .select();

      if (error) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(200).json(data[0]);
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
