import React, { useEffect, useRef, useState, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';

const VideoPlayer = ({ roomId, isHost }) => {
    const { socket } = useContext(SocketContext);
    const videoRef = useRef(null);
    const [videoSrc, setVideoSrc] = useState(''); // URL of the video
    const [isPlaying, setIsPlaying] = useState(false);
    const isRemoteUpdate = useRef(false); // Flag to prevent loop

    const [notification, setNotification] = useState('');
    const [mismatchWarning, setMismatchWarning] = useState(false);
    const [remoteFingerprint, setRemoteFingerprint] = useState(null);
    const [localFingerprint, setLocalFingerprint] = useState(null);

    const generateFingerprint = async (file) => {
        const chunkSize = 2048; // 2KB
        const startChunk = file.slice(0, chunkSize);
        const endChunk = file.slice(Math.max(0, file.size - chunkSize), file.size);

        const startBuffer = await startChunk.arrayBuffer();
        const endBuffer = await endChunk.arrayBuffer();

        // Simple hash: Size + First Byte + Last Byte + Sum of bytes (simplified for speed)
        const startView = new Uint8Array(startBuffer);
        const endView = new Uint8Array(endBuffer);

        let sum = 0;
        startView.forEach(b => sum += b);
        endView.forEach(b => sum += b);

        return `${file.size}-${startView[0]}-${endView[endView.length - 1]}-${sum}`;
    };

    const checkFingerprintMismatch = (local, remote) => {
        if (local && remote && local !== remote) {
            setMismatchWarning(true);
        } else {
            // Fallback to duration check if no fingerprint (e.g. URL vs File)
            setMismatchWarning(false);
        }
    };

    const checkMismatch = (remoteDuration) => {
        // If we have a fingerprint mismatch, keep showing it
        if (localFingerprint && remoteFingerprint && localFingerprint !== remoteFingerprint) {
            setMismatchWarning(true);
            return;
        }

        if (videoRef.current && remoteDuration) {
            const localDuration = videoRef.current.duration;
            if (Math.abs(localDuration - remoteDuration) > 2) {
                setMismatchWarning(true);
            } else {
                setMismatchWarning(false);
            }
        }
    };

    useEffect(() => {
        if (localFingerprint && remoteFingerprint) {
            checkFingerprintMismatch(localFingerprint, remoteFingerprint);
        }
    }, [localFingerprint, remoteFingerprint]);

    useEffect(() => {
        if (!socket) return;

        socket.on('sync_state', (state) => {
            console.log('Received sync state', state);
            isRemoteUpdate.current = true;
            if (state.videoSrc) {
                setVideoSrc(state.videoSrc);
            }
            if (state.fileFingerprint) {
                setRemoteFingerprint(state.fileFingerprint);
            }
            if (videoRef.current) {
                videoRef.current.currentTime = state.videoTime;
                if (state.isPlaying) {
                    videoRef.current.play().catch(e => console.error("Play error", e));
                    setIsPlaying(true);
                } else {
                    videoRef.current.pause();
                    setIsPlaying(false);
                }
            }
            setTimeout(() => { isRemoteUpdate.current = false; }, 500);
        });

        socket.on('receive_url_change', (data) => {
            console.log('Received url change', data);
            isRemoteUpdate.current = true;
            setVideoSrc(data.url);
            setNotification('');
            setMismatchWarning(false);
            setRemoteFingerprint(null); // URL has no fingerprint
            setIsPlaying(false);
            setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        });

        socket.on('receive_file_loaded', (data) => {
            setNotification(`Another user loaded file: "${data.fileName}". Please load the same file manually to sync.`);
            if (data.fingerprint) {
                setRemoteFingerprint(data.fingerprint);
            }
        });

        socket.on('receive_play', (data) => {
            console.log('Received play', data);
            checkMismatch(data.duration);
            isRemoteUpdate.current = true;
            if (videoRef.current) {
                const timeDiff = Math.abs(videoRef.current.currentTime - data.time);
                if (timeDiff > 0.5) {
                    videoRef.current.currentTime = data.time;
                }
                videoRef.current.play().catch(e => console.error("Play error", e));
                setIsPlaying(true);
            }
            setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        });

        socket.on('receive_pause', (data) => {
            console.log('Received pause', data);
            checkMismatch(data.duration);
            isRemoteUpdate.current = true;
            if (videoRef.current) {
                videoRef.current.pause();
                setIsPlaying(false);
                if (Math.abs(videoRef.current.currentTime - data.time) > 0.5) {
                    videoRef.current.currentTime = data.time;
                }
            }
            setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        });

        socket.on('receive_seek', (data) => {
            console.log('Received seek', data);
            checkMismatch(data.duration);
            isRemoteUpdate.current = true;
            if (videoRef.current) {
                videoRef.current.currentTime = data.time;
            }
            setTimeout(() => { isRemoteUpdate.current = false; }, 100);
        });

        return () => {
            socket.off('sync_state');
            socket.off('receive_url_change');
            socket.off('receive_file_loaded');
            socket.off('receive_play');
            socket.off('receive_pause');
            socket.off('receive_seek');
        };
    }, [socket]);

    const handlePlay = () => {
        if (isRemoteUpdate.current) return;
        if (socket) {
            socket.emit('play_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                timestamp: Date.now(),
                duration: videoRef.current.duration
            });
        }
    };

    const handlePause = () => {
        if (isRemoteUpdate.current) return;
        if (socket) {
            socket.emit('pause_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handleSeek = () => {
        if (isRemoteUpdate.current) return;
        if (socket) {
            socket.emit('seek_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = URL.createObjectURL(file);
            setVideoSrc(url);
            setNotification('');
            setMismatchWarning(false);

            const fingerprint = await generateFingerprint(file);
            setLocalFingerprint(fingerprint);

            if (socket) {
                socket.emit('file_loaded', { room: roomId, fileName: file.name, fingerprint });
            }
        }
    };

    const handleUrlChange = (e) => {
        const url = e.target.value;
        setVideoSrc(url);
        setMismatchWarning(false);
        setLocalFingerprint(null);
        if (socket) {
            socket.emit('video_url_change', { room: roomId, url });
        }
    };

    return (
        <div className="video-player-container">
            {notification && (
                <div style={{ backgroundColor: '#ffeb3b', color: 'black', padding: '10px', marginBottom: '10px', borderRadius: '4px' }}>
                    {notification}
                </div>
            )}
            {mismatchWarning && (
                <div style={{ backgroundColor: '#ff5722', color: 'white', padding: '10px', marginBottom: '10px', borderRadius: '4px' }}>
                    ⚠️ Warning: Video duration mismatch! You might be watching a different video than the host.
                </div>
            )}
            <div style={{ marginBottom: '10px' }}>
                <input type="text" placeholder="Video URL (e.g. .mp4 link)" onChange={handleUrlChange} style={{ width: '60%', marginRight: '10px' }} />
                <span>OR</span>
                <input type="file" accept="video/*" onChange={handleFileChange} style={{ marginLeft: '10px' }} />
            </div>
            <br />
            {videoSrc && (
                <video
                    ref={videoRef}
                    src={videoSrc}
                    controls
                    width="100%"
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onSeeked={handleSeek}
                />
            )}
        </div>
    );
};

export default VideoPlayer;
