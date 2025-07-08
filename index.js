const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // Import ObjectId
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const UAParser = require('ua-parser-js');

const app = express();
const port = process.env.PORT || 3001;
const mongoUrl = 'mongodb://mongo:zvThAbneromnVGGDkkIFcqrwsPMDVQdf@hopper.proxy.rlwy.net:19822';
const client = new MongoClient(mongoUrl);

let ipLogsCollection;

async function connectDb() {
    try {
        await client.connect();
        const db = client.db('ip_tracker'); // You can name your database
        ipLogsCollection = db.collection('ip_logs');
        console.log('Connected successfully to MongoDB');
    } catch (e) {
        console.error('Could not connect to MongoDB', e);
        process.exit(1);
    }
}

// Middleware
app.set('trust proxy', 1); // Trust the first proxy
app.use(cors()); // Enable CORS for all routes
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());


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
            const parser = new UAParser(req.headers['user-agent']);
            const uaInfo = parser.getResult();
            const device = `${uaInfo.browser.name || 'N/A'} ${uaInfo.browser.version || ''} on ${uaInfo.os.name || 'N/A'} ${uaInfo.os.version || ''}`.trim();

            const log = {
                timestamp: new Date(),
                ip: data.query,
                city: data.city,
                region: data.regionName,
                country: data.country,
                lat: data.lat,
                lon: data.lon,
                device: device // Store parsed device info
            };

            // Store in database
            await ipLogsCollection.insertOne(log);
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
app.get('/api/admin/logs', basicAuth, async (req, res) => {
    try {
        const logs = await ipLogsCollection.find({}).sort({ timestamp: -1 }).toArray();
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API for admin to delete a single log
app.delete('/api/admin/logs/:id', basicAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await ipLogsCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 1) {
            res.status(200).json({ message: 'Log deleted successfully' });
        } else {
            res.status(404).json({ message: 'Log not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API for admin to delete all logs
app.delete('/api/admin/logs', basicAuth, async (req, res) => {
    try {
        await ipLogsCollection.deleteMany({});
        res.status(200).json({ message: 'All logs deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


connectDb().then(() => {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}); 