import { Router } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// GET /api/logs
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const conversationId = req.query.conversation_id as string | undefined;

    let query = supabase
      .from('inference_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (conversationId) {
      query = query.eq('conversation_id', conversationId);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

export default router;
