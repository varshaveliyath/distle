const express = require('express');
const router = express.Router();
const db = require('../db');
const { calculateDistance } = require('../socket');
const multer = require('multer');
const path = require('path');

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });


// Helper - History Upsert
function upsertHistory(userId, date, data) {
    const existing = db.prepare('SELECT * FROM history WHERE user_id = ? AND date = ?').get(userId, date);
    if (existing) {
        if (data.note !== undefined) db.prepare('UPDATE history SET note = ? WHERE user_id = ? AND date = ?').run(data.note, userId, date);
        if (data.photo_url !== undefined) db.prepare('UPDATE history SET photo_url = ? WHERE user_id = ? AND date = ?').run(data.photo_url, userId, date);
    } else {
        db.prepare('INSERT INTO history (user_id, date, note, photo_url) VALUES (?, ?, ?, ?)').run(userId, date, data.note || '', data.photo_url || '');
    }
}

// Helper - Streak & Shared Updates
function checkAndIncrementStreak(userId) {
    const today = new Date().toISOString().split('T')[0];
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (user.last_note_date === today && user.last_photo_date === today && user.last_active !== today) {
        let newStreak = 1;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (user.last_active === yesterdayStr) {
            newStreak = user.streak_count + 1;
        }

        db.prepare('UPDATE users SET last_active = ?, streak_count = ? WHERE id = ?').run(today, newStreak, userId);
        return newStreak;
    }
    return user.streak_count;
}

router.post('/note', (req, res) => {
    const { userId, note } = req.body;
    const today = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE users SET note = ?, last_note_date = ? WHERE id = ?').run(note, today, userId);
    upsertHistory(userId, today, { note });
    const streak = checkAndIncrementStreak(userId);
    const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);
    if (user && user.pair_id && req.app.get('io')) {
        req.app.get('io').to(user.pair_id).emit('partner-note-update', { note, streak });
    }
    res.json({ success: true, streak });
});

router.post('/photo', upload.single('photo'), (req, res) => {
    const { userId } = req.body;
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const photoUrl = `/uploads/${req.file.filename}`;
    const today = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE users SET photo_url = ?, last_photo_date = ? WHERE id = ?').run(photoUrl, today, userId);
    upsertHistory(userId, today, { photo_url: photoUrl });

    const streak = checkAndIncrementStreak(userId);
    const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);
    if (user && user.pair_id && req.app.get('io')) {
        req.app.get('io').to(user.pair_id).emit('partner-photo-update', { photoUrl, streak });
    }
    res.json({ success: true, photoUrl, streak });
});

router.get('/history/:userId/:date', (req, res) => {
    const { userId, date } = req.params;
    const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);

    const myItem = db.prepare('SELECT note, photo_url FROM history WHERE user_id = ? AND date = ?').get(userId, date) || {};
    let partnerItem = {};

    if (user && user.pair_id) {
        partnerItem = db.prepare('SELECT note, photo_url FROM history WHERE user_id = ? AND date = ?').get(user.pair_id, date) || {};
    }

    res.json({ mine: myItem, partner: partnerItem });
});

router.get('/partner-status/:userId', (req, res) => {
    const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(req.params.userId);
    if (!user || !user.pair_id) return res.json({});
    const partner = db.prepare('SELECT username, note, lat, lon, photo_url, streak_count, last_active, created_at FROM users WHERE id = ?').get(user.pair_id);
    res.json(partner);
});

router.get('/distance/:userId', (req, res) => {
    const userId = req.params.userId;
    const user = db.prepare('SELECT lat, lon, pair_id FROM users WHERE id = ?').get(userId);
    if (!user || !user.pair_id) return res.json({ distance: null });

    const partner = db.prepare('SELECT lat, lon FROM users WHERE id = ?').get(user.pair_id);
    if (!partner || user.lat === null || partner.lat === null) return res.json({ distance: null });

    const distance = calculateDistance(user.lat, user.lon, partner.lat, partner.lon);
    res.json({ distance: distance.toFixed(2), unit: 'km' });
});

module.exports = router;
