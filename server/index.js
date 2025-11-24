const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const socketHandler = require('./socketHandler');

const app = express();
app.use(cors());

const server = http.createServer(app);

// CORS configuration - allows both production and development origins
const allowedOrigins = process.env.CLIENT_URL
    ? [process.env.CLIENT_URL, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost', 'https://localhost']
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost', 'https://localhost'];

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

socketHandler(io);

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
