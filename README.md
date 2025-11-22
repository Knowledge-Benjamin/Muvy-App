# Muvy - Watch Together 🎬

A real-time synchronized video watching application with voice chat. Watch videos together with friends and family, no matter where they are!

## Features

- 🎥 **Synchronized Video Playback** - Play, pause, and seek in perfect sync
- 🎙️ **Real-time Voice Chat** - Talk while you watch using WebRTC
- 👑 **Host System** - First person in the room becomes the host
- 📁 **Local File Support** - Upload and watch your own video files
- 🔗 **URL Support** - Watch videos from any public URL
- ⚠️ **Content Mismatch Detection** - Warns if users are watching different videos
- 🎨 **Premium Glassmorphic UI** - Beautiful, modern design optimized for movie watching

## Tech Stack

**Frontend:**
- React + Vite
- Socket.IO Client
- Simple-Peer (WebRTC)
- Glassmorphic CSS

**Backend:**
- Node.js + Express
- Socket.IO
- WebRTC Signaling

## Local Development

### Prerequisites
- Node.js 16+ and npm

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd Muvy
```

2. **Install server dependencies**
```bash
cd server
npm install
```

3. **Install client dependencies**
```bash
cd ../client
npm install
```

4. **Set up environment variables**

Create `.env` files based on the `.env.example` files:

**Server (.env):**
```env
PORT=3001
CLIENT_URL=http://localhost:5173
```

**Client (.env):**
```env
VITE_SERVER_URL=http://localhost:3001
```

### Running Locally

1. **Start the server** (in `server` directory):
```bash
npm start
```

2. **Start the client** (in `client` directory):
```bash
npm run dev
```

3. **Open your browser** to `http://localhost:5173`

## Deployment

### Deploy to Render (Backend)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Configure:
   - **Root Directory:** `server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment Variable:** `CLIENT_URL` = your Vercel URL

### Deploy to Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) and create a new project
2. Import your GitHub repository
3. Configure:
   - **Root Directory:** `client`
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Environment Variable:** `VITE_SERVER_URL` = your Render URL

## How to Use

1. **Create/Join a Room** - Enter any room ID to create or join a room
2. **Load a Video** - Either paste a video URL or upload a local file
3. **Invite Friends** - Share the room ID with friends
4. **Watch Together** - Video playback stays in sync for everyone
5. **Chat** - Use the built-in voice chat to talk while watching

## License

MIT

## Contributing

Pull requests are welcome! For major changes, please open an issue first.
