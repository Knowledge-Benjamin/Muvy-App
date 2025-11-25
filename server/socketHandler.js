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
            // data: { room, time, duration, partIndex? }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].isPlaying = true;
            rooms[data.room].videoTime = data.time;
            rooms[data.room].lastTimestamp = data.timestamp;
            if (data.partIndex !== undefined) {
                rooms[data.room].currentPartIndex = data.partIndex;
            }

            socket.to(data.room).emit('receive_play', { ...data, userId: socket.id });
        });

        socket.on('pause_video', (data) => {
            // data: { room, time, duration, partIndex? }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].isPlaying = false;
            rooms[data.room].videoTime = data.time;
            if (data.partIndex !== undefined) {
                rooms[data.room].currentPartIndex = data.partIndex;
            }

            socket.to(data.room).emit('receive_pause', { ...data, userId: socket.id });
        });

        socket.on('seek_video', (data) => {
            // data: { room, time, duration, partIndex? }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].videoTime = data.time;
            if (data.partIndex !== undefined) {
                rooms[data.room].currentPartIndex = data.partIndex;
            }

            socket.to(data.room).emit('receive_seek', { ...data, userId: socket.id });
        });

        socket.on('video_url_change', (data) => {
            // data: { room, url }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].videoSrc = data.url;
            rooms[data.room].videoTime = 0;
            rooms[data.room].isPlaying = false;
            rooms[data.room].playlist = null; // Clear playlist when single URL is set
            rooms[data.room].currentPartIndex = 0;

            socket.to(data.room).emit('receive_url_change', data);
        });

        // Multi-part video events
        socket.on('set_playlist', (data) => {
            // data: { room, playlist }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].playlist = data.playlist;
            rooms[data.room].currentPartIndex = 0;
            rooms[data.room].videoTime = 0;
            rooms[data.room].isPlaying = false;
            rooms[data.room].videoSrc = data.playlist[0]?.url || '';

            socket.to(data.room).emit('receive_playlist', { playlist: data.playlist });
        });

        socket.on('load_next_part', (data) => {
            // data: { room, partIndex }
            if (!rooms[data.room]) rooms[data.room] = {};
            rooms[data.room].currentPartIndex = data.partIndex;
            rooms[data.room].videoTime = 0;

            socket.to(data.room).emit('receive_next_part', { partIndex: data.partIndex });
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

                    // Notify others that this user left (for WebRTC cleanup)
                    socket.to(roomId).emit('user_left', socket.id);
                }
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);
        });
    });
};
