# 🏟️ Stadium Staking Terminal - Quick Reference

## 📦 What's Included

```
stadium-staking-terminal/
├── public/
│   └── index.html              # Frontend UI with terminal design
├── netlify/
│   └── functions/
│       └── api.js              # Netlify serverless function
├── server.js                   # Node.js Express server
├── package.json                # Dependencies
├── vercel.json                 # Vercel deployment config
├── netlify.toml                # Netlify deployment config
├── start.sh                    # Quick start script
├── README.md                   # Full documentation
├── DEPLOYMENT.md               # Detailed deployment guide
└── .gitignore                  # Git ignore rules
```

## ⚡ 30-Second Start

```bash
npm install && npm start
```

Visit: http://localhost:3000

## 🚀 Deploy in 60 Seconds

### Vercel (Recommended):
```bash
npm install -g vercel
vercel --prod
```

### Netlify:
```bash
npm install -g netlify-cli
netlify deploy --prod
```

## 🔑 Key Features

- ✅ **Real-time data** from Syndicate Commons
- ✅ **Terminal UI** with Stadium branding
- ✅ **Top 10 leaderboard** of stakers
- ✅ **Ecosystem rankings** of all appchains
- ✅ **Auto-refresh** every 5 minutes
- ✅ **Smart caching** for performance
- ✅ **No CORS issues** - backend proxy included
- ✅ **Mobile responsive**

## 📊 What It Shows

1. **Stadium Stats:**
   - Total SYND staked
   - Number of stakers
   - Ecosystem rank
   - Network share %

2. **Top 10 Stakers:**
   - Wallet addresses
   - Amount staked
   - % of Stadium total

3. **Ecosystem Rankings:**
   - All appchains ranked by stake
   - Staker counts
   - Network distribution

## 🔧 API Endpoints

Once deployed, you have these endpoints:

- `GET /` - Web interface
- `GET /api/stats` - All statistics (JSON)
- `GET /api/health` - Health check

Example:
```bash
curl https://your-domain.com/api/stats
```

## 🎨 Quick Customization

**Change colors** in `public/index.html`:
```css
--stadium-green: #00ff41;
--stadium-dark: #0a0e12;
```

**Change refresh interval** in `public/index.html`:
```javascript
REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
```

## 🐛 Quick Fixes

**Port in use?**
```bash
PORT=3001 npm start
```

**Dependencies issue?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Cache not working?**
```bash
curl http://localhost:3000/api/health
```

## 📱 Integration Ideas

1. **Embed in stadium.gg:**
   ```html
   <iframe src="https://staking.stadium.gg" width="100%" height="800px"></iframe>
   ```

2. **Custom subdomain:**
   - Deploy to Vercel/Netlify
   - Add DNS record: `staking.stadium.gg` → your deployment

3. **Share on socials:**
   - Already has OpenGraph tags
   - Terminal aesthetic is very shareable

## 🔒 Security

- ✅ Read-only (no wallet connections)
- ✅ No API keys needed
- ✅ CORS properly configured
- ✅ Public blockchain data only
- ✅ HTTPS automatic on all platforms

## 📈 Performance

- **First load:** ~2-5 seconds
- **Cached requests:** <100ms
- **Cache TTL:** 5 minutes
- **Auto-refresh:** 5 minutes

## 🎯 Best Deployment Options

| Platform | Best For | Difficulty | Cost |
|----------|----------|------------|------|
| **Vercel** | Node.js apps | ⭐ Easy | Free |
| **Netlify** | Serverless | ⭐ Easy | Free |
| **Railway** | Always-on | ⭐⭐ Medium | $5/mo |
| **Render** | Full control | ⭐⭐ Medium | Free |
| **VPS** | Custom setup | ⭐⭐⭐ Hard | Varies |

## 📚 Documentation

- **README.md** - Complete feature documentation
- **DEPLOYMENT.md** - Step-by-step deployment guides
- **This file** - Quick reference

## 🚨 Common Issues

### "Failed to fetch"
✅ Fixed with backend proxy - no more CORS errors!

### "Module not found"
```bash
npm install
```

### "Can't connect to Syndicate API"
- Check internet connection
- Verify API is not down: https://commons.explorer.syndicate.io

## 💡 Pro Tips

1. **Test locally first:** Always run `npm start` before deploying
2. **Use environment variables:** Set `PORT` for custom ports
3. **Monitor logs:** Check deployment platform logs for errors
4. **Cache works!** Don't worry if first load is slow
5. **Mobile works:** Test on your phone - it's fully responsive

## 🎉 You're Ready!

**To deploy:**
1. Download all files from outputs folder
2. Run `npm install`
3. Test with `npm start`
4. Deploy to your chosen platform
5. Share with your community!

## 🤝 Need Help?

1. Check README.md for detailed docs
2. Check DEPLOYMENT.md for platform-specific guides
3. Test API endpoint directly: `/api/stats`
4. Check browser/server console for errors
5. Contact Stadium team

---

**Built with ⚡ for Stadium | Play with Purpose**

🏟️ Track. Compete. Earn.
