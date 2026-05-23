"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// GET /api/conversations
router.get('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('conversations')
            .select('*')
            .order('updated_at', { ascending: false });
        if (error)
            throw error;
        res.json({ data });
    }
    catch (error) {
        next(error);
    }
});
// POST /api/conversations
router.post('/', async (req, res, next) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('conversations')
            .insert([{}]) // defaults are applied (status: 'active')
            .select()
            .single();
        if (error)
            throw error;
        res.status(201).json({ data });
    }
    catch (error) {
        next(error);
    }
});
// DELETE /api/conversations/:id
router.delete('/:id', async (req, res, next) => {
    try {
        const { id } = req.params;
        const { error } = await supabase_1.supabase
            .from('conversations')
            .update({ status: 'cancelled' })
            .eq('id', id);
        if (error)
            throw error;
        res.json({ success: true });
    }
    catch (error) {
        next(error);
    }
});
exports.default = router;
