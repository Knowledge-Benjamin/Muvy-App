# Multi-Part Video Upload Guide

## Why Multi-Part Upload?

Large video files (700MB+) can have issues with Dropbox streaming. Splitting your video into smaller parts ensures reliable playback while maintaining perfect synchronization.

## How to Split a Video

### Method 1: FFmpeg (Recommended - Free & Fast)

**Install FFmpeg:**
- Windows: Download from [ffmpeg.org](https://ffmpeg.org/download.html)
- Mac: `brew install ffmpeg`
- Linux: `sudo apt install ffmpeg`

**Split into 50MB parts:**
```bash
ffmpeg -i movie.mp4 -c copy -map 0 -f segment -segment_time 600 part%03d.mp4
```

**Split into specific number of parts (e.g., 20 parts):**
```bash
# For a 2-hour video (7200 seconds), 20 parts = 360 seconds each
ffmpeg -i movie.mp4 -c copy -map 0 -f segment -segment_time 360 part%03d.mp4
```

**Key Points:**
- `-c copy` = No re-encoding (fast, lossless)
- `-segment_time` = Duration of each part in seconds
- `part%03d.mp4` = Names files as part001.mp4, part002.mp4, etc.

### Method 2: LosslessCut (Free GUI Tool)

1. Download from [GitHub](https://github.com/mifi/lossless-cut)
2. Open your video
3. Mark segments where you want to split
4. Export all segments

## How to Upload

1. **Select Files in Order**: Click "Multi-Part Mode" toggle
2. **Choose All Parts**: Select files 1 by 1 in correct order
   - **First file selected** = Part 1
   - **Last file selected** = Last part
3. **Upload**: Click "Upload Parts" - all parts upload sequentially
4. **Watch**: Video plays seamlessly with auto-advance between parts

## Best Practices

- **Part Size**: 50-150MB per part (balance between upload reliability and number of parts)
- **Named Consistently**: part001.mp4, part002.mp4, etc. (easier to track)
- **Test First**: Try with a short video first to verify the process
- **Stable Connection**: Ensure stable internet during upload

## Troubleshooting

**Q: Parts play out of order**
A: Select files in the correct order when uploading

**Q: Gap between parts**
A: Normal - expect 0.5-2 second buffering between parts

**Q: Upload fails**
A: Check that each part is <150MB. Retry with smaller segments.

**Q: Sync issues**
A: Ensure all viewers are on the same part. They should auto-sync.
