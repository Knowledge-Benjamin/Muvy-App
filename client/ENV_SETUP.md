# Environment Configuration Guide

## Overview

Muvy uses separate environment configurations for development and production to ensure the app works correctly in different contexts:

- **Development**: Local testing with localhost server
- **Production**: Deployed app (Android, Vercel) with Render server

## Environment Files

### `.env.development`
Used for local development and testing.

```bash
# Server URL (local)
VITE_SERVER_URL=http://localhost:3001

# API Keys (same for all environments)
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_API_KEY=your_google_api_key
VITE_DROPBOX_APP_KEY=your_dropbox_key
```

### `.env.production`
Used for production builds (Android app, Vercel deployment).

```bash
# Server URL (Render production server)
VITE_SERVER_URL=https://muvy-app.onrender.com

# API Keys (same for all environments)
VITE_GOOGLE_CLIENT_ID=your_google_client_id
VITE_GOOGLE_API_KEY=your_google_api_key
VITE_DROPBOX_APP_KEY=your_dropbox_key
```

### `.env` (Local Only - Not in Git)
Your personal environment file with actual API keys. This file is gitignored.

## NPM Scripts

### Development
```bash
# Run dev server (uses .env.development)
npm run dev

# Build for development (uses .env.development)
npm run build:dev
```

### Production
```bash
# Build for production (uses .env.production)
npm run build

# Preview production build
npm run preview
```

### Android
```bash
# Build and sync to Android (production mode)
npm run android:build

# Build and sync to Android (development mode)
npm run android:build:dev

# Open in Android Studio
npm run android:open
```

## How It Works

### Vite Environment Modes

Vite automatically loads the correct `.env` file based on the `--mode` flag:

- `vite --mode development` → loads `.env.development`
- `vite build --mode production` → loads `.env.production`

### Environment Variable Access

In your code, access environment variables using:

```javascript
const serverUrl = import.meta.env.VITE_SERVER_URL;
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
```

## Deployment Configurations

### Vercel (Web App)
Vercel uses environment variables set in the Vercel dashboard:
- Go to Project Settings → Environment Variables
- Add `VITE_SERVER_URL=https://muvy-app.onrender.com`
- Add other API keys
- Vercel will use these during build, **not** the `.env.production` file

### Android App
Android app uses the **built** version from `dist/` folder:
- Run `npm run android:build` (uses `.env.production`)
- App connects to `https://muvy-app.onrender.com`
- Works anywhere in the world

### Local Development
- Run `npm run dev` (uses `.env.development`)
- Connects to `http://localhost:3001`
- Requires local server running

## Git Configuration

### Files in Git (Committed)
✅ `.env.development` - Development template
✅ `.env.production` - Production template
✅ `.env.example` - Example template

### Files NOT in Git (Gitignored)
❌ `.env` - Your personal environment file with real API keys
❌ `.env.local` - Local overrides

## Setup for New Developers

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/Muvy-App.git
   cd Muvy-App/client
   ```

2. **Copy environment template**
   ```bash
   cp .env.development .env
   ```

3. **Add your API keys to `.env`**
   - Get Google Client ID and API Key
   - Get Dropbox App Key
   - Update `.env` with your keys

4. **Run development server**
   ```bash
   npm install
   npm run dev
   ```

## Troubleshooting

### Issue: App can't connect to server

**Development:**
- Check `.env.development` has `VITE_SERVER_URL=http://localhost:3001`
- Ensure server is running: `cd server && npm start`

**Production (Android):**
- Check `.env.production` has `VITE_SERVER_URL=https://muvy-app.onrender.com`
- Rebuild: `npm run android:build`
- Ensure Render server is running

### Issue: Environment variables not updating

**Solution:**
1. Stop dev server
2. Delete `dist/` folder
3. Run `npm run dev` or `npm run build` again
4. Vite caches environment variables during build

### Issue: Vercel deployment not working

**Solution:**
- Vercel uses its own environment variables (not `.env.production`)
- Set variables in Vercel dashboard
- Redeploy after changing variables

## Security Best Practices

1. **Never commit `.env` file** - Contains real API keys
2. **Keep `.env.development` and `.env.production` generic** - Use placeholder values
3. **Rotate API keys** if accidentally committed
4. **Use different API keys** for development and production when possible

## Summary

| Environment | File | Server URL | Use Case |
|------------|------|------------|----------|
| Development | `.env.development` | `http://localhost:3001` | Local testing |
| Production | `.env.production` | `https://muvy-app.onrender.com` | Android app, builds |
| Vercel | Vercel Dashboard | `https://muvy-app.onrender.com` | Web deployment |
| Personal | `.env` | (your choice) | Local development with real keys |

**The key difference:** Development uses localhost, Production uses Render server!
