import React, { useState, useEffect, useRef } from 'react';

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY;

const DropboxUpload = ({ onLinkGenerated }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState(null);
    const [currentFile, setCurrentFile] = useState(null);
    const xhrRef = useRef(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.src = 'https://www.dropbox.com/static/api/2/dropins.js';
        script.id = 'dropboxjs';
        script.setAttribute('data-app-key', DROPBOX_APP_KEY);
        document.body.appendChild(script);

        const savedToken = localStorage.getItem('dropbox_access_token');
        if (savedToken) {
            setAccessToken(savedToken);
            setIsAuthenticated(true);
        }

        return () => {
            if (document.body.contains(script)) {
                document.body.removeChild(script);
            }
        };
    }, []);

    const handleAuth = () => {
        const redirectUri = window.location.origin;
        const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&response_type=token&redirect_uri=${redirectUri}`;

        const width = 600;
        const height = 700;
        const left = (window.screen.width / 2) - (width / 2);
        const top = (window.screen.height / 2) - (height / 2);

        const popup = window.open(authUrl, 'Dropbox Auth', `width=${width},height=${height},left=${left},top=${top}`);

        const checkPopup = setInterval(() => {
            try {
                if (popup.closed) {
                    clearInterval(checkPopup);
                    return;
                }

                const popupUrl = popup.location.href;
                if (popupUrl.includes('access_token=')) {
                    const token = popupUrl.split('access_token=')[1].split('&')[0];
                    setAccessToken(token);
                    setIsAuthenticated(true);
                    localStorage.setItem('dropbox_access_token', token);
                    popup.close();
                    clearInterval(checkPopup);
                }
            } catch (e) {
                // Cross-origin error, ignore
            }
        }, 500);
    };

    const handleSignOut = () => {
        setAccessToken(null);
        setIsAuthenticated(false);
        localStorage.removeItem('dropbox_access_token');
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
                        const linkResponse = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                path: data.path_display,
                                settings: { requested_visibility: 'public' },
                            }),
                        });

                        if (!linkResponse.ok) {
                            throw new Error('Failed to create share link');
                        }

                        const linkData = await linkResponse.json();
                        let directLink = linkData.url;
                        directLink = directLink.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
                        directLink = directLink.replace('?dl=0', '');

                        setUploadProgress(100);
                        setIsUploading(false);
                        setCurrentFile(null);

                        if (onLinkGenerated) {
                            onLinkGenerated(directLink);
                        }
                    } catch (error) {
                        console.error('Share link error:', error);
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

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            uploadToDropbox(file);
        }
    };

    return (
        <div style={{ marginTop: '10px', padding: '15px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: 'var(--accent-gold)', fontSize: '1rem' }}>
                📦 Dropbox (Perfect Sync)
            </h4>

            {!isAuthenticated ? (
                <div>
                    <button
                        onClick={handleAuth}
                        style={{
                            padding: '10px 20px',
                            background: '#0061FF',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.9rem',
                            marginBottom: '10px'
                        }}
                    >
                        🔐 Sign in with Dropbox
                    </button>
                    <div style={{ marginTop: '10px' }}>
                        <button
                            onClick={openChooser}
                            style={{
                                padding: '10px 20px',
                                background: 'transparent',
                                color: 'var(--accent-gold)',
                                border: '1px solid var(--accent-gold)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.9rem'
                            }}
                        >
                            📂 Browse Public Dropbox Files
                        </button>
                        <p style={{ margin: '5px 0 0 0', fontSize: '0.75rem', color: '#888' }}>
                            (No sign-in needed for public files)
                        </p>
                    </div>
                </div>
            ) : (
                <div>
                    <div style={{ marginBottom: '10px', fontSize: '0.9rem' }}>
                        ✅ Signed in to Dropbox
                        <button
                            onClick={handleSignOut}
                            style={{
                                marginLeft: '10px',
                                padding: '5px 10px',
                                background: 'transparent',
                                color: 'var(--accent-gold)',
                                border: '1px solid var(--accent-gold)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.8rem'
                            }}
                        >
                            Sign Out
                        </button>
                    </div>

                    {uploadError && (
                        <div style={{
                            padding: '10px',
                            background: 'rgba(191, 26, 26, 0.2)',
                            border: '1px solid var(--primary-red)',
                            borderRadius: '6px',
                            marginBottom: '10px',
                            fontSize: '0.85rem',
                            color: 'var(--primary-red)',
                            lineHeight: '1.4'
                        }}>
                            ❌ {uploadError}
                            <button
                                onClick={retryUpload}
                                style={{
                                    marginLeft: '10px',
                                    padding: '5px 15px',
                                    background: 'var(--primary-red)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem'
                                }}
                            >
                                🔄 Retry
                            </button>
                        </div>
                    )}

                    {isUploading ? (
                        <div>
                            <div style={{ marginBottom: '5px', fontSize: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Uploading... {uploadProgress}%</span>
                                <button
                                    onClick={cancelUpload}
                                    style={{
                                        padding: '5px 15px',
                                        background: 'transparent',
                                        color: 'var(--primary-red)',
                                        border: '1px solid var(--primary-red)',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    ✖ Cancel
                                </button>
                            </div>
                            <div style={{
                                width: '100%',
                                height: '8px',
                                background: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '4px',
                                overflow: 'hidden'
                            }}>
                                <div style={{
                                    width: `${uploadProgress}%`,
                                    height: '100%',
                                    background: 'var(--primary-orange)',
                                    transition: 'width 0.3s ease'
                                }} />
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                onClick={openChooser}
                                style={{
                                    padding: '10px 20px',
                                    background: 'var(--primary-orange)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.9rem'
                                }}
                            >
                                📂 Browse My Dropbox
                            </button>

                            <input
                                type="file"
                                accept="video/*"
                                onChange={handleFileSelect}
                                style={{ display: 'none' }}
                                id="dropbox-upload-input"
                            />
                            <label
                                htmlFor="dropbox-upload-input"
                                style={{
                                    display: 'inline-block',
                                    padding: '10px 20px',
                                    background: 'var(--primary-red)',
                                    color: 'white',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontWeight: '600',
                                    fontSize: '0.9rem'
                                }}
                            >
                                📤 Upload to Dropbox
                            </label>
                        </div>
                    )}
                    <p style={{ margin: '10px 0 0 0', fontSize: '0.8rem', color: '#888' }}>
                        ✨ Dropbox links work perfectly with video sync!
                    </p>
                </div>
            )}
        </div>
    );
};

export default DropboxUpload;
