import React, { useState, useEffect, useRef } from 'react';
import { Lock, Folder, Upload, Check, X, RotateCw, Sparkles, List, Film } from 'lucide-react';

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;
const FILE_SIZE_THRESHOLD = 150 * 1024 * 1024; // 150MB in bytes
const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks

const DropboxUpload = ({ onLinkGenerated }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);
    const xhrRef = useRef(null);

    // Multi-part upload state
    const [isMultiPartMode, setIsMultiPartMode] = useState(false);
    const [uploadQueue, setUploadQueue] = useState([]);
    const [currentPartIndex, setCurrentPartIndex] = useState(0);
    const [playlistParts, setPlaylistParts] = useState([]);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
        script.id = 'dropboxjs';
        script.setAttribute('data-app-key', DROPBOX_APP_KEY);
        document.body.appendChild(script);

        // Check for token in URL (from redirect)
        const hash = window.location.hash;
        if (hash.includes('access_token=')) {
            const token = hash.split('access_token=')[1].split('&')[0];
            setAccessToken(token);
            setIsAuthenticated(true);
            // Clear hash to clean up URL, but keep token in state
            window.history.replaceState(null, null, ' ');
        }
        // NOTE: We do NOT check localStorage here. 
        // This ensures that if the user refreshes without the hash, they are logged out.

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    const handleAuth = () => {
        // Hardcode redirect URI to ensure exact match with Console
        // For Android (Capacitor), this will be https://localhost
        // For Web, it will be the current origin
        const isAndroid = window.location.protocol === 'https:' && window.location.hostname === 'localhost';
        const redirectUri = isAndroid ? 'https://localhost' : window.location.origin;

        console.log('Dropbox Redirect URI:', redirectUri); // Debug log

        const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=token&redirect_uri=${redirectUri}`;

        // Set flag to re-open upload panel after redirect
        sessionStorage.setItem('muvy_auto_open_upload', 'true');

        // Use redirect instead of popup for better mobile support
        window.location.href = authUrl;
    };

    const handleSignOut = () => {
        setAccessToken(null);
        setIsAuthenticated(false);
        // No localStorage cleanup needed since we don't save it there anymore
    };

    const openChooser = () => {
        if (!window.Dropbox) {
            alert('Dropbox is still loading, please wait...');
            return;
        }

        const options = {
            success: async (files) => {
                const file = files[0];
                let link = file.link;
                link = link.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                link = link.split('?')[0];

                if (onLinkGenerated) {
                    onLinkGenerated(link);
                }
            },
            cancel: () => {
                console.log('User canceled');
            },
            linkType: 'direct',
            multiselect: false,
            extensions: ['.mp4', '.webm', '.mkv', '.avi', '.mov'],
        };

        window.Dropbox.choose(options);
    };

    const cancelUpload = () => {
        if (xhrRef.current) {
            xhrRef.current.abort();
            setIsUploading(false);
            setUploadProgress(0);
            setUploadError(null);
            setCurrentFile(null);
        }
    };

    const retryUpload = () => {
        if (currentFile) {
            setUploadError(null);
            uploadToDropbox(currentFile);
        }
    };

    const createShareLink = async (pathDisplay) => {
        try {
            // First, try to list existing shared links
            const listResponse = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    path: pathDisplay,
                    direct_only: true
                }),
            });

            let directLink;

            if (listResponse.ok) {
                const listData = await listResponse.json();

                // If link already exists, use it
                if (listData.links && listData.links.length > 0) {
                    directLink = listData.links[0].url;
                } else {
                    // No existing link, create a new one
                    const createResponse = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            path: pathDisplay,
                            settings: { requested_visibility: 'public' },
                        }),
                    });

                    if (!createResponse.ok) {
                        const errorData = await createResponse.json();

                        // If link already exists (race condition), list again
                        if (errorData.error && errorData.error['.tag'] === 'shared_link_already_exists') {
                            const retryList = await fetch('https://api.dropboxapi.com/2/sharing/list_shared_links', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${accessToken}`,
                                    'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                    path: pathDisplay,
                                    direct_only: true
                                }),
                            });

                            if (retryList.ok) {
                                const retryData = await retryList.json();
                                if (retryData.links && retryData.links.length > 0) {
                                    directLink = retryData.links[0].url;
                                }
                            }
                        }

                        if (!directLink) {
                            throw new Error('Failed to create or retrieve share link');
                        }
                    } else {
                        const createData = await createResponse.json();
                        directLink = createData.url;
                    }
                }
            } else {
                throw new Error('Failed to list shared links');
            }

            // Convert to direct download link
            directLink = directLink.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
            directLink = directLink.replace('?dl=0', '');

            return directLink;
        } catch (error) {
            console.error('Share link error:', error);
            throw error;
        }
    };

    const uploadLargeFile = async (file) => {
        try {
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            let uploadedBytes = 0;
            let sessionId = null;

            // Start upload session
            const startChunk = file.slice(0, Math.min(CHUNK_SIZE, file.size));
            const startResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/octet-stream',
                },
                body: startChunk,
            });

            if (!startResponse.ok) {
                throw new Error('Failed to start upload session');
            }

            const startData = await startResponse.json();
            sessionId = startData.session_id;
            uploadedBytes += startChunk.size;
            setUploadProgress(Math.round((uploadedBytes / file.size) * 90));

            // Upload remaining chunks
            for (let chunkIndex = 1; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);
                const isLast = chunkIndex === totalChunks - 1;

                if (isLast) {
                    // Finish session with last chunk
                    const finishResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Dropbox-API-Arg': JSON.stringify({
                                cursor: {
                                    session_id: sessionId,
                                    offset: uploadedBytes,
                                },
                                commit: {
                                    path: `/${file.name}`,
                                    mode: 'add',
                                    autorename: true,
                                    mute: false,
                                },
                            }),
                            'Content-Type': 'application/octet-stream',
                        },
                        body: chunk,
                    });

                    if (!finishResponse.ok) {
                        throw new Error('Failed to finish upload session');
                    }

                    const finishData = await finishResponse.json();
                    setUploadProgress(95);

                    // Create share link
                    const directLink = await createShareLink(finishData.path_display);

                    setUploadProgress(100);
                    setIsUploading(false);
                    setCurrentFile(null);

                    if (onLinkGenerated) {
                        onLinkGenerated(directLink);
                    }
                } else {
                    // Append chunk
                    const appendResponse = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${accessToken}`,
                            'Dropbox-API-Arg': JSON.stringify({
                                cursor: {
                                    session_id: sessionId,
                                    offset: uploadedBytes,
                                },
                            }),
                            'Content-Type': 'application/octet-stream',
                        },
                        body: chunk,
                    });

                    if (!appendResponse.ok) {
                        throw new Error('Failed to append chunk');
                    }

                    uploadedBytes += chunk.size;
                    setUploadProgress(Math.round((uploadedBytes / file.size) * 90));
                }
            }
        } catch (error) {
            console.error('Large file upload error:', error);
            setIsUploading(false);
            setUploadError('Large file upload failed. Please try again.');
        }
    };

    const uploadToDropbox = async (file) => {
        if (!accessToken) {
            alert('Please sign in to Dropbox first');
            return;
        }

        setCurrentFile(file);
        setIsUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        try {
            // Use chunked upload for large files
            if (file.size > FILE_SIZE_THRESHOLD) {
                await uploadLargeFile(file);
                return;
            }

            // Regular upload for small files
            const xhr = new XMLHttpRequest();
            xhrRef.current = xhr;

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 90);
                    setUploadProgress(percentComplete);
                }
            });

            xhr.addEventListener('load', async () => {
                if (xhr.status === 200) {
                    setUploadProgress(95);
                    const data = JSON.parse(xhr.responseText);

                    try {
                        const directLink = await createShareLink(data.path_display);
                        setUploadProgress(100);
                        setIsUploading(false);
                        setCurrentFile(null);

                        if (onLinkGenerated) {
                            onLinkGenerated(directLink);
                        }
                    } catch (error) {
                        setIsUploading(false);
                        setUploadError('Failed to create share link. Please try again.');
                    }
                } else {
                    // Parse error response from Dropbox
                    let errorMessage = 'Upload failed. ';

                    try {
                        const errorData = JSON.parse(xhr.responseText);
                        if (errorData.error_summary) {
                            const summary = errorData.error_summary;

                            if (summary.includes('required scope')) {
                                errorMessage = 'Missing permissions. Enable "files.content.write" in Dropbox App Console → Permissions, then sign out and sign in again.';
                            } else if (summary.includes('user limit')) {
                                errorMessage = 'App has reached user limit. Use "Browse Public Dropbox Files" instead.';
                            } else {
                                errorMessage += summary;
                            }
                        } else {
                            errorMessage += `Status ${xhr.status}. Please try again.`;
                        }
                    } catch (e) {
                        // If can't parse error, show generic message
                        if (xhr.status === 400) {
                            errorMessage += 'Bad request. Check app permissions.';
                        } else if (xhr.status === 401) {
                            errorMessage += 'Authentication failed. Please sign in again.';
                        } else {
                            errorMessage += `Status ${xhr.status}. Please try again.`;
                        }
                    }

                    console.error('Upload failed:', xhr.status, xhr.responseText);
                    setIsUploading(false);
                    setUploadError(errorMessage);
                }
            });

            xhr.addEventListener('error', () => {
                console.error('Upload network error');
                setIsUploading(false);
                setUploadError('Upload failed. Please check your connection and try again.');
            });

            xhr.addEventListener('abort', () => {
                setIsUploading(false);
                setUploadProgress(0);
            });

            xhr.open('POST', 'https://content.dropboxapi.com/2/files/upload');
            xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
            xhr.setRequestHeader('Dropbox-API-Arg', JSON.stringify({
                path: `/${file.name}`,
                mode: 'add',
                autorename: true,
                mute: false,
            }));
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.send(file);

        } catch (error) {
            console.error('Error uploading to Dropbox:', error);
            setIsUploading(false);
            setUploadError('Upload failed. Please try again.');
        }
    };

    const handleMultiPartUpload = async (event) => {
        const files = Array.from(event.target.files);

        if (files.length === 0) return;

        // Files are now in selection order (first selected = Part 1, last = Part N)
        // No sorting needed - respect user's selection order

        // Initialize upload queue
        const queue = files.map((file, index) => ({
            index: index + 1,
            filename: file.name,
            file: file,
            progress: 0,
            status: 'pending', // 'pending' | 'uploading' | 'done' | 'error'
            url: null
        }));

        setUploadQueue(queue);
        setIsUploading(true);
        setUploadError(null);

        const playlist = [];

        // Upload files sequentially
        for (let i = 0; i < files.length; i++) {
            setCurrentPartIndex(i + 1);

            // Update queue status
            setUploadQueue(prev => prev.map((item, idx) =>
                idx === i ? { ...item, status: 'uploading' } : item
            ));

            try {
                // Upload using existing uploadToDropbox logic
                const url = await uploadSinglePart(files[i], i);

                playlist.push({
                    part: i + 1,
                    filename: files[i].name,
                    url: url,
                    size: files[i].size
                });

                // Update queue status to done
                setUploadQueue(prev => prev.map((item, idx) =>
                    idx === i ? { ...item, status: 'done', url: url, progress: 100 } : item
                ));

            } catch (error) {
                console.error(`Failed to upload part ${i + 1}:`, error);

                // Update queue status to error
                setUploadQueue(prev => prev.map((item, idx) =>
                    idx === i ? { ...item, status: 'error' } : item
                ));

                setUploadError(`Failed to upload part ${i + 1}: ${files[i].name}`);
                break; // Stop on first error
            }
        }

        setIsUploading(false);
        setPlaylistParts(playlist);

        // Emit playlist to parent (App.jsx will handle this)
        if (playlist.length === files.length && onLinkGenerated) {
            onLinkGenerated({ type: 'playlist', playlist });
        }
    };

    const uploadSinglePart = (file, partIndex) => {
        return new Promise(async (resolve, reject) => {
            try {
                // Use chunked upload for large files
                if (file.size > FILE_SIZE_THRESHOLD) {
                    const url = await uploadLargeFilePart(file, partIndex);
                    resolve(url);
                    return;
                }

                // Regular upload for small files
                const xhr = new XMLHttpRequest();

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percentComplete = Math.round((e.loaded / e.total) * 100);

                        // Update queue progress
                        setUploadQueue(prev => prev.map((item, idx) =>
                            idx === partIndex ? { ...item, progress: percentComplete } : item
                        ));
                    }
                });

                xhr.addEventListener('load', async () => {
                    if (xhr.status === 200) {
                        const data = JSON.parse(xhr.responseText);

                        try {
                            const directLink = await createShareLink(data.path_display);
                            resolve(directLink);
                        } catch (error) {
                            reject(new Error('Failed to create share link'));
                        }
                    } else {
                        reject(new Error(`Upload failed with status ${xhr.status}`));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('Network error during upload'));
                });

                xhr.open('POST', 'https://content.dropboxapi.com/2/files/upload');
                xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
                xhr.setRequestHeader('Dropbox-API-Arg', JSON.stringify({
                    path: `/${file.name}`,
                    mode: 'add',
                    autorename: true,
                    mute: false,
                }));
                xhr.setRequestHeader('Content-Type', 'application/octet-stream');
                xhr.send(file);

            } catch (error) {
                reject(error);
            }
        });
    };

    const uploadLargeFilePart = async (file, partIndex) => {
        // Similar to uploadLargeFile but with progress updates for specific part
        // ... implementation would be similar to existing uploadLargeFile
        // For now, using regular upload
        return uploadSinglePart(file, partIndex);
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            uploadToDropbox(file);
        }
    };

    return (
        <div className="upload-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Folder size={16} /> Dropbox (Perfect Sync)
            </label>

            {!isAuthenticated ? (
                <div>
                    <button
                        onClick={handleAuth}
                        style={{
                            padding: '0.625rem 1.25rem',
                            background: 'var(--white)',
                            color: 'var(--black)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.75rem',
                            marginBottom: '0.625rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                    >
                        <Lock size={16} /> Sign in with Dropbox
                    </button>
                    <div style={{ marginTop: '10px' }}>
                        <button
                            onClick={openChooser}
                            style={{
                                padding: '0.625rem 1.25rem',
                                background: 'transparent',
                                color: 'var(--white)',
                                border: '1px solid var(--gray-300)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Folder size={16} /> Browse Public Dropbox Files
                        </button>
                        <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)' }}>
                            (No sign-in needed for public files)
                        </p>
                    </div>
                </div>
            ) : (
                <div>
                    <div style={{ marginBottom: '0.625rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Check size={14} /> Signed in to Dropbox
                            <button
                                onClick={handleSignOut}
                                style={{
                                    marginLeft: '0.625rem',
                                    padding: '0.3rem 0.625rem',
                                    background: 'transparent',
                                    color: 'var(--white)',
                                    border: '1px solid var(--gray-300)',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem'
                                }}
                            >
                                Sign Out
                            </button>
                        </div>

                        {/* Multi-Part Mode Toggle */}
                        <button
                            onClick={() => setIsMultiPartMode(!isMultiPartMode)}
                            style={{
                                padding: '0.3rem 0.625rem',
                                background: isMultiPartMode ? 'var(--white)' : 'transparent',
                                color: isMultiPartMode ? 'var(--black)' : 'var(--white)',
                                border: `1px solid ${isMultiPartMode ? 'var(--white)' : 'var(--gray-300)'}`,
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                transition: 'all 0.2s ease'
                            }}
                            title="Multi-Part Mode (for large videos split into parts)"
                        >
                            {isMultiPartMode ? <List size={14} /> : <Film size={14} />}
                            {isMultiPartMode ? 'Multi-Part' : 'Single File'}
                        </button>
                    </div>

                    {uploadError && (
                        <div style={{
                            padding: '0.625rem',
                            background: 'var(--gray-100)',
                            border: '1px solid var(--white)',
                            borderRadius: 'var(--radius-sm)',
                            marginBottom: '0.625rem',
                            fontSize: '0.7rem',
                            color: 'var(--white)',
                            lineHeight: '1.4',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}>
                            <X size={14} /> {uploadError}
                            <button
                                onClick={retryUpload}
                                style={{
                                    marginLeft: 'auto',
                                    padding: '0.3rem 0.9rem',
                                    background: 'var(--white)',
                                    color: 'var(--black)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                }}
                            >
                                <RotateCw size={12} /> Retry
                            </button>
                        </div>
                    )}

                    {isUploading ? (
                        <div>
                            {isMultiPartMode && uploadQueue.length > 0 ? (
                                // Multi-part upload queue
                                <div>
                                    <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                                        Uploading Parts ({currentPartIndex}/{uploadQueue.length})
                                    </div>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.4rem',
                                        maxHeight: '200px',
                                        overflowY: 'auto'
                                    }}>
                                        {uploadQueue.map((item, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    padding: '0.4rem 0.5rem',
                                                    background: item.status === 'uploading' ? 'var(--gray-100)' : 'var(--glass-bg)',
                                                    border: `1px solid ${item.status === 'done' ? 'var(--white)' : item.status === 'error' ? '#ef4444' : 'var(--gray-300)'}`,
                                                    borderRadius: 'var(--radius-sm)',
                                                    fontSize: '0.7rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    transition: 'all 0.2s ease'
                                                }}
                                            >
                                                {item.status === 'done' && <Check size={12} style={{ color: 'var(--white)' }} />}
                                                {item.status === 'error' && <X size={12} style={{ color: '#ef4444' }} />}
                                                {item.status === 'uploading' && <Upload size={12} />}
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    Part {item.index}: {item.filename}
                                                </span>
                                                {item.status === 'uploading' && (
                                                    <span style={{ fontSize: '0.65rem', color: 'var(--gray-400)' }}>
                                                        {item.progress}%
                                                    </span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                // Single file upload progress
                                <>
                                    <div style={{ marginBottom: '0.3rem', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>Uploading... {uploadProgress}%</span>
                                        <button
                                            onClick={cancelUpload}
                                            style={{
                                                padding: '0.3rem 0.9rem',
                                                background: 'transparent',
                                                color: 'var(--white)',
                                                border: '1px solid var(--gray-300)',
                                                borderRadius: 'var(--radius-sm)',
                                                cursor: 'pointer',
                                                fontSize: '0.7rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.3rem'
                                            }}
                                        >
                                            <X size={12} /> Cancel
                                        </button>
                                    </div>
                                    <div style={{
                                        width: '100%',
                                        height: '0.5rem',
                                        background: 'var(--gray-100)',
                                        borderRadius: 'var(--radius-sm)',
                                        overflow: 'hidden'
                                    }}>
                                        <div style={{
                                            width: `${uploadProgress}%`,
                                            height: '100%',
                                            background: 'var(--white)',
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                            <button
                                onClick={openChooser}
                                style={{
                                    padding: '0.625rem 1.25rem',
                                    background: 'var(--white)',
                                    color: 'var(--black)',
                                    border: 'none',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.75rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem'
                                }}
                            >
                                <Folder size={16} /> Browse My Dropbox
                            </button>

                            <input
                                type="file"
                                accept="video/*"
                                multiple={isMultiPartMode}
                                onChange={isMultiPartMode ? handleMultiPartUpload : handleFileSelect}
                                style={{ display: 'none' }}
                                id="dropbox-upload-input"
                            />
                            <label
                                htmlFor="dropbox-upload-input"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.625rem 1.25rem',
                                    background: 'transparent',
                                    color: 'var(--white)',
                                    border: '1px solid var(--gray-300)',
                                    borderRadius: 'var(--radius-sm)',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.75rem'
                                }}
                            >
                                <Upload size={16} />
                                {isMultiPartMode ? 'Upload Parts' : 'Upload to Dropbox'}
                            </label>
                            {isMultiPartMode && (
                                <p style={{ width: '100%', margin: '0.3rem 0 0 0', fontSize: '0.65rem', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                    <List size={10} /> Select parts in order: 1st file = Part 1, last file = Last part
                                </p>
                            )}
                        </div>
                    )}
                    {!isMultiPartMode && (
                        <p style={{ margin: '0.625rem 0 0 0', fontSize: '0.7rem', color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <Sparkles size={12} /> Supports files up to 150GB! Perfect video sync.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default DropboxUpload;
