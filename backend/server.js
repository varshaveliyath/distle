require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Modular Imports
const db = require('./src/db');
const { initSocket } = require('./src/socket');

const app = express();
const server = http.createServer(app);
const io = initSocket(server);

// Share IO instance with routes
app.set('io', io);

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// Request Logging for Debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve Static Uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Multer Setup (used in user routes)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });
app.set('upload', upload);

// API Routes
app.use('/api', require('./src/routes/auth'));
app.use('/api', upload.single('photo'), require('./src/routes/user'));
app.use('/api/admin', require('./src/routes/admin'));

// Serve Frontend in Production
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  console.log(`[Server] Serving frontend from ${frontendDist}`);
  app.use(express.static(frontendDist));

  // Catch-all for SPA routing
  app.get('/:path*', (req, res) => {
    if (!req.url.startsWith('/api')) {
      console.log(`[Server] Serving index.html for ${req.url}`);
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
} else {
  console.log(`[Server] Frontend dist not found at ${frontendDist}. API only mode.`);
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] distle engine online at port ${PORT}`);
  console.log(`[Server] Root directory: ${__dirname}`);
});
