# 🚀 Stadium Staking Terminal - Deployment Guide

## 📋 What You Have

A complete Node.js web application with:
- Frontend: `public/index.html` (Terminal UI)
- Backend: `server.js` (Express API)
- Serverless: `netlify/functions/api.js` (Netlify function)
- Config: `vercel.json`, `netlify.toml`, `package.json`

## ⚡ Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Start server
npm start

# 3. Open browser
open http://localhost:3000
```

**Or use the convenience script:**
```bash
./start.sh
```

## 🌐 Production Deployment Options

### Option 1: Vercel (Easiest - Recommended)

**Why Vercel?**
- ✅ Automatic SSL
- ✅ Global CDN
- ✅ Zero config needed
- ✅ Free tier is generous
- ✅ Perfect for Node.js

**Steps:**

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Login**
   ```bash
   vercel login
   ```

3. **Deploy**
   ```bash
   vercel --prod
   ```

4. **Done!** You'll get a URL like: `https://stadium-staking-terminal.vercel.app`

**Via Vercel Dashboard:**
1. Go to https://vercel.com/new
2. Import from Git repository
3. Vercel auto-detects configuration
4. Click Deploy

**Custom Domain:**
- Go to Vercel dashboard
- Add domain: `staking.stadium.gg`
- Follow DNS instructions

---

### Option 2: Netlify (Great Alternative)

**Why Netlify?**
- ✅ Serverless functions built-in
- ✅ Great for static sites + APIs
- ✅ Easy continuous deployment
- ✅ Generous free tier

**Steps:**

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login**
   ```bash
   netlify login
   ```

3. **Deploy**
   ```bash
   netlify deploy --prod
   ```

**Via Netlify Dashboard:**
1. Go to https://app.netlify.com/start
2. Connect Git repository
3. Build settings are auto-detected from `netlify.toml`
4. Deploy

**Custom Domain:**
- Go to Domain settings in Netlify
- Add custom domain
- Configure DNS

---

### Option 3: Railway (Best for Always-On Server)

**Why Railway?**
- ✅ Always-on server (not serverless)
- ✅ Great for Node.js apps
- ✅ Simple deployment
- ✅ $5/month starter plan

**Steps:**

1. **Create account** at https://railway.app

2. **Install Railway CLI**
   ```bash
   npm install -g @railway/cli
   ```

3. **Login and deploy**
   ```bash
   railway login
   railway init
   railway up
   ```

4. **Generate domain**
   ```bash
   railway domain
   ```

**Via Railway Dashboard:**
1. Create new project
2. Deploy from GitHub
3. Add environment variables (if needed)
4. Railway auto-starts your server

---

### Option 4: Render (Another Excellent Option)

**Why Render?**
- ✅ Free tier for web services
- ✅ Auto-deploy from Git
- ✅ Easy to use
- ✅ Good performance

**Steps:**

1. **Create account** at https://render.com

2. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your Git repository

3. **Configure:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`

4. **Deploy** - Click "Create Web Service"

---

### Option 5: Traditional VPS (Advanced)

**Platforms:** DigitalOcean, Linode, AWS EC2, etc.

**Steps:**

1. **Setup server** (Ubuntu 22.04 recommended)

2. **Install Node.js**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Clone your code**
   ```bash
   git clone <your-repo>
   cd stadium-staking-terminal
   ```

4. **Install dependencies**
   ```bash
   npm install
   ```

5. **Use PM2 for process management**
   ```bash
   npm install -g pm2
   pm2 start server.js --name "stadium-staking"
   pm2 save
   pm2 startup
   ```

6. **Setup Nginx reverse proxy** (optional)
   ```nginx
   server {
       listen 80;
       server_name staking.stadium.gg;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

7. **Setup SSL with Let's Encrypt**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d staking.stadium.gg
   ```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file (optional):
```bash
PORT=3000
NODE_ENV=production
```

### Custom Domain Setup

**For Vercel:**
1. Go to project settings
2. Add domain
3. Update DNS:
   ```
   Type: CNAME
   Name: staking
   Value: cname.vercel-dns.com
   ```

**For Netlify:**
1. Add custom domain in settings
2. Update DNS:
   ```
   Type: CNAME
   Name: staking
   Value: <your-site>.netlify.app
   ```

---

## 📊 Monitoring

### Check if server is running:
```bash
curl http://localhost:3000/api/health
```

### Expected response:
```json
{
  "status": "ok",
  "uptime": 123.45,
  "cache": {
    "hasData": true,
    "age": 42
  }
}
```

### Check logs:

**Local:**
```bash
npm start
# Logs appear in terminal
```

**Vercel:**
- Dashboard → Your Project → Logs

**Netlify:**
- Dashboard → Functions → Logs

**Railway/Render:**
- Built-in log viewer in dashboard

---

## 🚨 Troubleshooting

### Issue: "CORS Error"
✅ **Already Fixed!** The backend handles all API calls.

### Issue: "Port already in use"
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or change port in server.js
```

### Issue: "Module not found"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Issue: "Data not loading"
1. Check backend logs for errors
2. Test API directly: `curl http://localhost:3000/api/stats`
3. Verify Syndicate API is accessible
4. Check network/firewall settings

### Issue: "Deployment failed"

**Vercel:**
- Check `vercel.json` is in root
- Verify `node-fetch` version is 2.x
- Check build logs

**Netlify:**
- Check `netlify.toml` is in root
- Verify functions directory exists
- Check function logs

---

## 🎯 Performance Tips

1. **Cache Duration:** Already optimized at 5 minutes
2. **CDN:** Vercel/Netlify provide automatic CDN
3. **Compression:** Enable gzip in server.js:
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

---

## 🔒 Security Checklist

- ✅ CORS properly configured
- ✅ No API keys exposed (none needed)
- ✅ HTTPS enabled (automatic on Vercel/Netlify)
- ✅ Rate limiting via cache
- ✅ Input validation (read-only, no user input)

---

## 📈 Analytics (Optional)

Add Google Analytics to `public/index.html`:
```html
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 🎨 Customization After Deployment

All colors, text, and settings can be changed in:
- `public/index.html` - Frontend
- `server.js` - Backend config

Simply redeploy after making changes!

---

## ✅ Pre-Deployment Checklist

- [ ] Dependencies installed (`npm install`)
- [ ] Local testing complete (`npm start`)
- [ ] Git repository created (if using Git deploy)
- [ ] Platform account created (Vercel/Netlify/Railway)
- [ ] Domain ready (if using custom domain)
- [ ] SSL certificate (automatic on most platforms)

---

## 🎉 Success!

Once deployed, your Stadium Staking Terminal will be live at your chosen URL!

**Share it with your community:**
- Twitter/X announcement
- Discord/Telegram updates
- Add to stadium.gg website
- Create QR code for easy access

---

**Need Help?** Check the main README.md or contact the Stadium team!

**Built with ⚡ for Stadium | Play with Purpose**
