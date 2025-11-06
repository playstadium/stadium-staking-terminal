# 🏟️ STADIUM Staking Terminal

A standalone mini-site for tracking real-time SYND staking data for the Stadium appchain.

## ✨ Features

- 📊 **Real-time Data** - Fetches live staking data from Syndicate Commons Explorer
- 🎨 **Terminal Aesthetic** - Retro terminal UI with Stadium branding
- 🏆 **Leaderboards** - Top 10 stakers and ecosystem rankings
- 📱 **Responsive** - Works on desktop, tablet, and mobile
- ⚡ **Auto-refresh** - Updates every 5 minutes automatically
- 🔒 **Backend API** - Node.js server to avoid CORS issues
- 💾 **Smart Caching** - 5-minute cache for better performance

## 🚀 Quick Start

### Option 1: Local Development

1. **Install dependencies:**
```bash
npm install
```

2. **Start the server:**
```bash
npm start
```

3. **Visit in browser:**
```
http://localhost:3000
```

### Option 2: Deploy to Vercel (Recommended)

1. **Install Vercel CLI:**
```bash
npm install -g vercel
```

2. **Deploy:**
```bash
vercel --prod
```

That's it! Vercel will automatically detect the configuration and deploy both the frontend and backend.

**Or use the Vercel Dashboard:**
- Go to https://vercel.com/new
- Import your Git repository
- Vercel auto-detects the `vercel.json` config
- Deploy!

### Option 3: Deploy to Netlify

1. **Install Netlify CLI:**
```bash
npm install -g netlify-cli
```

2. **Deploy:**
```bash
netlify deploy --prod
```

**Or use Netlify Dashboard:**
- Go to https://app.netlify.com/start
- Connect your Git repository
- Netlify auto-detects the `netlify.toml` config
- Deploy!

### Option 4: Deploy to Railway/Render

Both Railway and Render work great for Node.js apps:

**Railway:**
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

**Render:**
- Go to https://render.com
- Create new Web Service
- Connect your repository
- Build command: `npm install`
- Start command: `npm start`

## 📁 Project Structure

```
stadium-staking-terminal/
├── public/
│   └── index.html          # Frontend UI
├── netlify/
│   └── functions/
│       └── api.js          # Netlify serverless function
├── server.js               # Node.js Express server
├── package.json            # Dependencies
├── vercel.json            # Vercel configuration
├── netlify.toml           # Netlify configuration
└── README.md              # This file
```

## 🔧 How It Works

### Architecture

```
Browser → Node.js Server → Syndicate API → Process Data → Send to Browser
          (Avoids CORS)
```

The backend server:
1. Receives requests from the frontend at `/api/stats`
2. Fetches logs from Syndicate Commons Blockscout API
3. Processes and aggregates staking data
4. Caches results for 5 minutes
5. Returns formatted statistics to frontend

### API Endpoints

- `GET /` - Serves the frontend UI
- `GET /api/stats` - Returns all staking statistics
- `GET /api/health` - Health check endpoint

### Data Flow

1. **Frontend** calls `/api/stats`
2. **Backend** checks cache (5-minute TTL)
3. If cache miss, fetch from Syndicate API
4. Process logs to extract staking data
5. Calculate statistics and rankings
6. Cache results and return to frontend
7. Frontend updates UI with formatted data

## 🎨 Customization

### Change Colors

Edit CSS variables in `public/index.html`:

```css
:root {
    --stadium-green: #00ff41;    /* Main accent color */
    --stadium-dark: #0a0e12;     /* Background */
    --stadium-gray: #1a1f26;     /* Cards background */
}
```

### Change Refresh Interval

In `public/index.html`:
```javascript
const CONFIG = {
    REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
};
```

In `server.js`:
```javascript
let cache = {
    ttl: 5 * 60 * 1000 // 5 minutes
};
```

### Change Stadium Appchain ID

In both `server.js` and `netlify/functions/api.js`:
```javascript
const CONFIG = {
    STADIUM_APPCHAIN_ID: 574014, // Your appchain ID
};
```

## 🐛 Troubleshooting

### CORS Errors?
✅ **Fixed!** The backend server handles all API requests, avoiding CORS issues entirely.

### Port Already in Use?
Change the port in `server.js`:
```javascript
const PORT = process.env.PORT || 3000; // Change 3000 to another port
```

### Data Not Loading?
1. Check backend logs for errors
2. Test API directly: `curl http://localhost:3000/api/stats`
3. Verify Syndicate API is accessible
4. Check cache status: `curl http://localhost:3000/api/health`

### Deployment Issues?

**Vercel:**
- Ensure `vercel.json` is in root directory
- Check build logs in Vercel dashboard
- Verify `node-fetch` version is 2.x (not 3.x)

**Netlify:**
- Ensure `netlify.toml` is in root directory
- Check function logs in Netlify dashboard
- Verify all dependencies are installed

## 📊 Data Displayed

### Stadium Stats
- Total SYND staked to Stadium
- Number of unique stakers
- Ecosystem rank
- Network share percentage

### Ecosystem Rankings
- Top 10 appchains by total stake
- Staker count per appchain
- Percentage share of network

### Top 10 Stakers
- Leaderboard of biggest Stadium stakers
- Wallet addresses (truncated for privacy)
- Amount staked per wallet
- Percentage of Stadium total

## 🔒 Security Notes

- Read-only interface (no wallet connections)
- No sensitive data stored
- All data is public blockchain information
- Server-side caching prevents API spam
- CORS properly configured

## 🌐 Environment Variables

For production deployments, you can set:

```bash
PORT=3000                    # Server port (optional, defaults to 3000)
```

No API keys or secrets required!

## 📈 Performance

- **First Load**: ~2-5 seconds (fetches all historical data)
- **Cached Requests**: <100ms
- **Cache Duration**: 5 minutes
- **Auto-refresh**: Every 5 minutes

## 🎯 Next Steps

### Potential Enhancements:
1. **Historical Charts** - Add Chart.js for trend visualization
2. **Real-time Updates** - WebSocket connection for live data
3. **Wallet Search** - Search for specific wallet addresses
4. **Export Data** - Download CSV of current rankings
5. **Notifications** - Alert system for milestones
6. **Analytics** - Track page views and engagement

### Integration Ideas:
- Embed in main Stadium website as iframe
- Create subdomain: `staking.stadium.gg`
- Share on social media with OpenGraph tags
- Link from Discord bot with updates

## 📝 License

Open source - customize and use as needed for Stadium.

## 🤝 Support

For issues:
1. Check browser console (F12)
2. Check server logs
3. Test API endpoints directly
4. Review deployment platform logs

---

**Built with ⚡ for Stadium | Play with Purpose**
