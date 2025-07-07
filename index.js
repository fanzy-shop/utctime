const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const path = require('path');

const app = express();
const port = 3001;

// Basic Authentication for Admin Panel
const basicAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication required.');
    }

    const auth = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    const user = auth[0];
    const pass = auth[1];

    if (user === 'admin' && pass === 'password') { // Replace with environment variables in a real app
        next();
    } else {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
        return res.status(401).send('Authentication failed.');
    }
};

// Database setup
const db = new sqlite3.Database('./db/ipdata.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS ip_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        ip TEXT,
        city TEXT,
        region TEXT,
        country TEXT,
        lat REAL,
        lon REAL
    )`);
});


app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());


// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/admin', basicAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// API to get user IP and location
app.get('/api/ip', async (req, res) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // For local development, ip-api.com needs an empty IP to use the request's public IP
    if (ip === '::1' || ip === '127.0.0.1') {
        ip = '';
    }
    
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        const data = response.data;

        if (data.status === 'success') {
            const { country, regionName, city, lat, lon } = data;
            const log = {
                timestamp: new Date().toISOString(),
                ip: data.query,
                city: city,
                region: regionName,
                country: country,
                lat: lat,
                lon: lon
            };

            // Store in database
            const stmt = db.prepare("INSERT INTO ip_logs (timestamp, ip, city, region, country, lat, lon) VALUES (?, ?, ?, ?, ?, ?, ?)");
            stmt.run(log.timestamp, log.ip, log.city, log.region, log.country, log.lat, log.lon);
            stmt.finalize();

            res.json(log);
        } else {
            res.status(500).json({ message: 'Failed to fetch location data.' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching IP data.' });
    }
});

// API for admin to view logs
app.get('/api/admin/logs', basicAuth, (req, res) => {
    db.all("SELECT * FROM ip_logs ORDER BY timestamp DESC", [], (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
}); 