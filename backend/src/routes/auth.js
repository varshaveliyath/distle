const express = require('express');
const router = express.Router();
const db = require('../db');

router.post('/register', (req, res) => {
    const { username, password } = req.body;
    const id = 'user_' + Math.random().toString(36).substr(2, 9);
    const pairing_code = Math.floor(100000 + Math.random() * 900000).toString();
    try {
        db.prepare('INSERT INTO users (id, username, password, pairing_code) VALUES (?, ?, ?, ?)').run(id, username, password, pairing_code);
        res.json({ id, username, pairing_code });
    } catch (err) { res.status(400).json({ error: 'Username already exists' }); }
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
    if (user) {
        console.log(`[Auth] User ${username} logged in`);
        res.json(user);
    } else res.status(401).json({ error: 'Invalid credentials' });
});

router.post('/pair', (req, res) => {
    const { userId, partnerCode } = req.body;
    const partner = db.prepare('SELECT id FROM users WHERE pairing_code = ? AND id != ?').get(partnerCode, userId);
    if (partner) {
        db.prepare('UPDATE users SET pair_id = ? WHERE id = ?').run(userId, partner.id);
        db.prepare('UPDATE users SET pair_id = ? WHERE id = ?').run(partner.id, userId);
        console.log(`[Auth] User ${userId} paired with ${partner.id}`);
        res.json({ success: true, partnerId: partner.id });
    } else res.status(400).json({ success: false, message: 'Invalid pairing code' });
});

module.exports = router;
