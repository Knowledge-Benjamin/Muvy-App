const rooms = {}; // { roomId: { videoSrc, isPlaying, lastTimestamp, videoTime } }

module.exports = (io) => {
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        socket.on('join_room', (roomId) => {
            socket.join(roomId);
            socket.currentRoom = roomId; // Track room for disconnect
            console.log(`User ${socket.id} joined room ${roomId}`);
            socket.to(roomId).emit('user_joined', socket.id);

            // Initialize room if needed
            if (!rooms[roomId]) {
                rooms[roomId] = {
                    hostId: socket.id,
                    videoSrc: '',
                    isPlaying: false,
                    videoTime: 0,
                    lastTimestamp: 0
                };
            }

            // Send current room state to the new user
            socket.emit('sync_state', rooms[roomId]);

            // Broadcast room metadata (Host + Count) to ALL users including the one joining
            const roomSize = io.sockets.adapter.rooms.get(roomId)?.size || 0;
            io.in(roomId).emit('room_metadata', {
                hostId: rooms[roomId].hostId,
                userCount: roomSize
            });
        });

        socket.on('send_message', (data) => {
            socket.to(data.room).emit('receive_message', data);
        });

        // Sync events
        socket.on('play_video', (data) => {
            // data: { room, time, timestamp }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].isPlaying = true;
            rooms[data.room].videoTime = data.time;
            rooms[data.room].lastTimestamp = data.timestamp;

            socket.to(data.room).emit('receive_play', data);
        });

        socket.on('pause_video', (data) => {
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].isPlaying = false;
            rooms[data.room].videoTime = data.time;

            socket.to(data.room).emit('receive_pause', data);
        });

        socket.on('seek_video', (data) => {
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].videoTime = data.time;

            socket.to(data.room).emit('receive_seek', data);
        });

        socket.on('video_url_change', (data) => {
            // data: { room, url }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].videoSrc = data.url;
            rooms[data.room].videoTime = 0;
            rooms[data.room].isPlaying = false;

            socket.to(data.room).emit('receive_url_change', data);
        });

        socket.on('file_loaded', (data) => {
            // data: { room, fileName, fingerprint }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].fileFingerprint = data.fingerprint;

            socket.to(data.room).emit('receive_file_loaded', data);
        });

        // WebRTC Signaling
        socket.on('signal', (data) => {
            // data: { to, signal, from }
            io.to(data.to).emit('signal', { signal: data.signal, from: socket.id });
        });

        socket.on('disconnecting', () => {
            const roomId = socket.currentRoom;
            if (roomId && rooms[roomId]) {
                // If host is leaving, assign new host
                if (rooms[roomId].hostId === socket.id) {
                    const roomSockets = io.sockets.adapter.rooms.get(roomId);
                    if (roomSockets && roomSockets.size > 1) {
                        // Find next socket that is NOT the one disconnecting
                        for (const id of roomSockets) {
                            if (id !== socket.id) {
                                rooms[roomId].hostId = id;
                                break;
                            }
                        }
                    } else {
                        // Last person left, delete room state
                        delete rooms[roomId];
                    }
                }

                // Emit updated metadata to remaining users
                if (rooms[roomId]) {
                    const roomSize = (io.sockets.adapter.rooms.get(roomId)?.size || 1) - 1;
                    io.in(roomId).emit('room_metadata', {
                        hostId: rooms[roomId].hostId,
                        userCount: roomSize
                    });
                }
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
};
