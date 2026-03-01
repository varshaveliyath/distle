const { Server } = require('socket.io');
const db = require('./db');

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function initSocket(server) {
    const io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });

    io.on('connection', (socket) => {
        socket.on('join', (userId) => {
            console.log(`[Socket] User ${userId} joined their room`);
            socket.join(userId);
        });

        socket.on('update-location', ({ userId, lat, lon, accuracy }) => {
            const lastUser = db.prepare('SELECT lat, accuracy FROM users WHERE id = ?').get(userId);
            if (accuracy > 100 && lastUser && lastUser.lat !== null && lastUser.accuracy < accuracy) {
                return;
            }

            db.prepare('UPDATE users SET lat = ?, lon = ?, accuracy = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?').run(lat, lon, accuracy, userId);

            const user = db.prepare('SELECT pair_id FROM users WHERE id = ?').get(userId);
            if (user && user.pair_id) {
                const partner = db.prepare('SELECT lat, lon, accuracy FROM users WHERE id = ?').get(user.pair_id);
                if (partner && partner.lat !== null) {
                    const distance = calculateDistance(lat, lon, partner.lat, partner.lon);
                    const midpoint = { lat: (lat + partner.lat) / 2, lon: (lon + partner.lon) / 2 };
                    const combinedAccuracy = Math.max(accuracy || 0, partner.accuracy || 0);

                    io.to(userId).emit('distance-update', { distance, midpoint, accuracy: combinedAccuracy });
                    io.to(user.pair_id).emit('distance-update', { distance, midpoint, accuracy: combinedAccuracy });
                }
            }
        });

        socket.on('disconnect', () => {
            // Logic for disconnect if needed
        });
    });

    return io;
}

module.exports = { initSocket, calculateDistance };
