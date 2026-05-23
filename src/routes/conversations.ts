import { Router } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// GET /api/conversations
router.get('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    res.json({ data });
  } catch (error) {
    next(error);
  }
});

// POST /api/conversations
router.post('/', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('conversations')
      .insert([{}]) // defaults are applied (status: 'active')
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ data });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/conversations/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
