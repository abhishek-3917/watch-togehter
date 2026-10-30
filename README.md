# Watch Together

A two-person watch-party starter with synchronized playback, WebRTC audio/video, and room chat.

## Deploy publicly (one Render web service)

This repository is configured so the Node server serves both the built React website and Socket.IO from one HTTPS origin.

1. Create a GitHub repository and upload the contents of this folder (the `package.json`, `client/`, and `server/` must be at the repository root).
2. Sign in to Render and choose **New → Web Service**.
3. Connect your GitHub repository.
4. Set:
   - Runtime: `Node`
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Instance type: `Free` for a test, or a paid instance if you need it to stay awake.
5. Deploy. Render will provide a public `https://your-service.onrender.com` URL.
6. Open that URL on your device, create a room, and share the invite link with your partner.

The app uses same-origin Socket.IO, so no separate frontend URL or CORS setting is required.

## Free hosting limitation
Render free web services spin down after 15 minutes without inbound traffic and can take about a minute to start again. They are useful for demos but are not guaranteed to be continuously available. See Render's current free-instance documentation before relying on it for a planned movie night.

## Local development
- Terminal 1: `cd server && npm install && npm run dev`
- Terminal 2: `cd client && npm install && npm run dev`
- Open the Vite URL in two browser sessions.

## Video sources
This app does **not** connect to FMovies or scrape third-party streaming sites. Use a direct browser-playable MP4/WebM URL or an authorized provider embed that you have permission to use. A normal webpage URL is not necessarily a playable video URL. Many streaming services block iframe playback or use DRM; those services need their own approved integration.

## Production notes
- Use HTTPS (Render provides it) for camera/microphone access.
- Configure TURN servers for reliable WebRTC across restrictive networks. Set `VITE_TURN_URL`, `VITE_TURN_USERNAME`, and `VITE_TURN_CREDENTIAL` at build time if using a TURN provider.
- This starter is designed for two participants per room and uses in-memory room state. Add authentication, persistent storage, rate limits, and room expiry before public launch.

## External website iframe test

The room now has an **Embed website** field (pre-filled with `https://1fmovies.us/`). Loading a website broadcasts its URL to the other participant and displays it in an iframe. This is a compatibility test only: the remote site can refuse framing using `X-Frame-Options` or CSP `frame-ancestors`. The app cannot override those headers. Cross-origin iframe navigation and playback controls are not synchronized; only the initial website URL is shared. If the site blocks framing, use a provider-supported embed or another authorized source.
