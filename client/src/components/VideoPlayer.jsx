import React, { useEffect, useRef, useState, useContext } from 'react';
import { SocketContext } from '../context/SocketContext';
import { Link } from 'lucide-react';

const VideoPlayer = ({ roomId, isHost, videoSrc, setVideoSrc }) => {
    const { socket } = useContext(SocketContext);
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const isRemoteUpdate = useRef(false);
    const pendingSync = useRef(null);
    const lastRemoteTime = useRef(0);

    const [notification, setNotification] = useState('');
    const [mismatchWarning, setMismatchWarning] = useState(false);

    const checkMismatch = (remoteDuration) => {
        if (!videoRef.current) return;
        const localDuration = videoRef.current.duration;
        if (Math.abs(localDuration - remoteDuration) > 1) {
            setMismatchWarning(true);
        } else {
            setMismatchWarning(false);
        }
    };

    // Force reload video when source changes
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.load();
        }
    }, [videoSrc]);

    // Apply pending sync when video metadata loads
    const handleLoadedMetadata = () => {
        if (pendingSync.current && videoRef.current) {
            const state = pendingSync.current;
            console.log('Applying pending sync state:', state);

            // Prevent emitting events back to server
            isRemoteUpdate.current = true;
            lastRemoteTime.current = state.videoTime || 0;

            if (state.videoTime) {
                videoRef.current.currentTime = state.videoTime;
            }

            if (state.isPlaying) {
                videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
                setIsPlaying(true);
            }

            pendingSync.current = null;

            // Reset flag after a delay to ensure events are suppressed
            setTimeout(() => {
                isRemoteUpdate.current = false;
            }, 2000);
        }
    };

    useEffect(() => {
        if (!socket) return;

        // Initial state sync for playback (Late Joiner Fix)
        socket.on('sync_state', (state) => {
            console.log('Received sync state in player:', state);

            if (videoRef.current) {
                // Video element exists, apply immediately
                isRemoteUpdate.current = true;
                lastRemoteTime.current = state.videoTime || 0;

                if (state.videoTime) {
                    videoRef.current.currentTime = state.videoTime;
                }

                if (state.isPlaying) {
                    videoRef.current.play().catch(e => console.log('Autoplay blocked:', e));
                    setIsPlaying(true);
                } else {
                    videoRef.current.pause();
                    setIsPlaying(false);
                }

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 2000);
            } else {
                // Video element not ready (e.g. just joined), store for later
                console.log('Video not ready, storing pending sync');
                pendingSync.current = state;
            }
        });

        socket.on('receive_play', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                lastRemoteTime.current = data.time;

                videoRef.current.currentTime = data.time;
                videoRef.current.play();
                setIsPlaying(true);
                checkMismatch(data.duration);

                // Show toast notification
                const userId = data.userId ? data.userId.substring(0, 8) : 'Someone';
                setNotification(`▶️ ${userId} played the video`);
                setTimeout(() => setNotification(''), 3000);

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 2000);
            }
        });

        socket.on('receive_pause', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                lastRemoteTime.current = data.time;

                videoRef.current.currentTime = data.time;
                videoRef.current.pause();
                setIsPlaying(false);
                checkMismatch(data.duration);

                // Show toast notification
                const userId = data.userId ? data.userId.substring(0, 8) : 'Someone';
                setNotification(`⏸️ ${userId} paused the video`);
                setTimeout(() => setNotification(''), 3000);

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 2000);
            }
        });

        socket.on('receive_seek', (data) => {
            if (videoRef.current) {
                isRemoteUpdate.current = true;
                lastRemoteTime.current = data.time;

                videoRef.current.currentTime = data.time;
                checkMismatch(data.duration);

                // Show toast notification
                const userId = data.userId ? data.userId.substring(0, 8) : 'Someone';
                const minutes = Math.floor(data.time / 60);
                const seconds = Math.floor(data.time % 60);
                setNotification(`⏩ ${userId} seeked to ${minutes}:${seconds.toString().padStart(2, '0')}`);
                setTimeout(() => setNotification(''), 3000);

                setTimeout(() => {
                    isRemoteUpdate.current = false;
                }, 2000);
            }
        });

        return () => {
            socket.off('sync_state');
            socket.off('receive_play');
            socket.off('receive_pause');
            socket.off('receive_seek');
        };
    }, [socket]);

    const handlePlay = (e) => {
        // Ignore script-triggered events (like from socket sync)
        if (e && e.nativeEvent && !e.nativeEvent.isTrusted) return;
        if (isRemoteUpdate.current) return;

        setIsPlaying(true);
        if (socket) {
            socket.emit('play_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handlePause = (e) => {
        // Ignore script-triggered events
        if (e && e.nativeEvent && !e.nativeEvent.isTrusted) return;
        if (isRemoteUpdate.current) return;

        setIsPlaying(false);
        if (socket) {
            socket.emit('pause_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handleSeeked = (e) => {
        // Ignore script-triggered events
        if (e && e.nativeEvent && !e.nativeEvent.isTrusted) return;
        if (isRemoteUpdate.current) return;

        // Anti-Loop: If seek time is very close to last remote update, ignore it
        if (videoRef.current && Math.abs(videoRef.current.currentTime - lastRemoteTime.current) < 1.5) {
            console.log('Ignoring seek loop echo');
            return;
        }

        if (socket) {
            socket.emit('seek_video', {
                room: roomId,
                time: videoRef.current.currentTime,
                duration: videoRef.current.duration
            });
        }
    };

    const handleUrlChange = (e) => {
        const url = e.target.value;
        setVideoSrc(url);
        setMismatchWarning(false);
        if (socket) {
            socket.emit('video_url_change', { room: roomId, url });
        }
    };

    return (
        <div className="video-player-container">
            {notification && (
                <div className="notification notification-info">
                    {notification}
                </div>
            )}
            {mismatchWarning && (
                <div className="notification notification-warning">
                    ⚠️ Warning: Video duration mismatch! You might be watching a different video than the host.
                </div>
            )}

            {/* Video URL Input */}
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    placeholder="Paste video URL"
                    value={videoSrc}
                    onChange={handleUrlChange}
                    style={{ paddingLeft: '2.5rem' }}
                />
                <Link size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
            </div>

            {/* Video Player */}
            {videoSrc && (
                <div className="video-wrapper">
                    {videoSrc.includes('drive.google.com') ? (
                        <iframe
                            src={videoSrc}
                            allow="autoplay"
                            title="Google Drive Video"
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            controls
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onSeeked={handleSeeked}
                            onLoadedMetadata={handleLoadedMetadata}
                        >
                            <source src={videoSrc} type="video/mp4" />
                            Your browser does not support the video tag.
                        </video>
                    )}
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
