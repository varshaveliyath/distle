const express = require('express');
const router = express.Router();
const db = require('../db');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

router.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ success: true, token: 'admin-session-active' });
    } else {
        res.status(401).json({ error: 'Invalid admin password' });
    }
});

router.get('/databases', (req, res) => {
    try {
        const backendFiles = fs.readdirSync(path.join(__dirname, '..', '..')).filter(f => f.endsWith('.db')).map(f => path.join('backend', f));
        const rootFiles = fs.readdirSync(path.join(__dirname, '..', '..', '..')).filter(f => f.endsWith('.db')).map(f => f);
        const allDbs = [...new Set([...backendFiles, ...rootFiles])];
        res.json(allDbs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to list databases' });
    }
});

router.get('/tables', (req, res) => {
    const dbName = req.query.db;
    if (!dbName) return res.status(400).json({ error: 'Missing db query parameter' });

    const dbFilePath = path.join(__dirname, '..', '..', '..', dbName);
    if (!fs.existsSync(dbFilePath)) return res.status(404).json({ error: 'Database not found' });

    try {
        const tempDb = new Database(dbFilePath);
        const tables = tempDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
        tempDb.close();
        res.json(tables.map(t => t.name));
    } catch (err) {
        res.status(500).json({ error: 'Failed to list tables' });
    }
});

router.get('/data', (req, res) => {
    const dbName = req.query.db;
    const tableName = req.query.table;
    if (!dbName || !tableName) return res.status(400).json({ error: 'Missing parameters' });

    const dbFilePath = path.join(__dirname, '..', '..', '..', dbName);
    if (!fs.existsSync(dbFilePath)) return res.status(404).json({ error: 'Database not found' });

    try {
        const tempDb = new Database(dbFilePath);
        const rows = tempDb.prepare(`SELECT * FROM ${tableName} LIMIT 100`).all();
        tempDb.close();
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch table data' });
    }
});

router.delete('/row', (req, res) => {
    const { db: dbName, table, column, value } = req.body;
    if (!dbName || !table || !column || value === undefined) return res.status(400).json({ error: 'Missing parameters' });

    const dbFilePath = path.join(__dirname, '..', '..', '..', dbName);
    if (!fs.existsSync(dbFilePath)) return res.status(404).json({ error: 'Database not found' });

    try {
        const tempDb = new Database(dbFilePath);
        const result = tempDb.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(value);
        tempDb.close();
        res.json({ success: true, changes: result.changes });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete row' });
    }
});

module.exports = router;
