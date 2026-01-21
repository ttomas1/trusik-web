const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Serve static files, but exclude logs directory
app.use(express.static('.', {
    setHeaders: (res, filePath) => {
        // Block access to logs directory
        if (filePath.includes('logs')) {
            res.status(403).end();
        }
    }
}));

// Block direct access to logs directory
app.use('/logs', (req, res) => {
    res.status(403).json({ error: 'Access denied' });
});

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Logging endpoint
app.post('/api/log', (req, res) => {
    const { sessionId, command, timestamp } = req.body;

    if (!sessionId || !command) {
        return res.status(400).json({ error: 'Missing sessionId or command' });
    }

    const logFile = path.join(logsDir, `session_${sessionId}.txt`);
    const logEntry = `[${timestamp || new Date().toISOString()}] ${command}\n`;

    fs.appendFile(logFile, logEntry, (err) => {
        if (err) {
            console.error('Error writing log:', err);
            return res.status(500).json({ error: 'Failed to write log' });
        }
        res.json({ success: true });
    });
});

// Start new session - creates log file with header
app.post('/api/session/start', (req, res) => {
    const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    const logFile = path.join(logsDir, `session_${sessionId}.txt`);

    const header = `=== Session Started: ${new Date().toISOString()} ===\n` +
        `User-Agent: ${req.headers['user-agent'] || 'Unknown'}\n` +
        `IP: ${req.ip || req.connection.remoteAddress || 'Unknown'}\n` +
        `${'='.repeat(50)}\n\n`;

    fs.writeFile(logFile, header, (err) => {
        if (err) {
            console.error('Error creating session log:', err);
            return res.status(500).json({ error: 'Failed to create session' });
        }
        res.json({ sessionId });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
