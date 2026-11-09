<<<<<<< HEAD
# VanishChat Deployment TODO (Free Tier: Render.com)\n\n## Phase 1: GitHub Setup [ ]\n- [ ] \`git init\`\n- [ ] \`git add .\`\n- [ ] \`git commit -m \"Initial commit: SecChat ready for deploy\"\`\n- [ ] Create public GitHub repo (e.g., SecChat)\n- [ ] \`git remote add origin https://github.com/YOURUSERNAME/SecChat.git\`\n- [ ] \`git branch -M main\`\n- [ ] \`git push -u origin main\`\n\n## Phase 2: Render.com Deploy [ ]\n- [ ] Sign up at render.com (free)\n- [ ] Connect GitHub account\n- [ ] New > Web Service > Select repo\n- [ ] Settings: Build \`npm install\`, Start \`npm start\`, Env \`NODE_ENV=production\`\n- [ ] Create MySQL DB (Private Network), note creds\n- [ ] Add env vars to Web service: DB_HOST, DB_USER, etc. from DB\n- [ ] Run DB init: Render shell > \`npm run db:init\`\n\n## Phase 3: Test & Go Live [ ]\n- [ ] Visit https://yourapp.onrender.com\n- [ ] Create room code, test chat in 2 tabs/browsers\n- [ ] Verify encryption, expiry, typing indicators\n- [ ] [Optional] Custom domain (Render free subdomain fine)\n\n## Alternatives (if Render limits hit) [ ]\n- Railway.app (free $5 credit/mo)\n- Fly.io (free VM allowance)\n\n**Current: Phase 1**
=======
# TODO: Real-time Typing Indicator Feature

## Plan

- [x] Server-side: Add `chat:typing` event handler in server.js
- [x] Client-side: Add typing detection and Socket.IO listeners in app.js
- [x] HTML: Add typing indicator element in index.html
- [x] CSS: Add styles for typing indicator in style.css

## Bug Fix

- [x] Fixed timezone issue causing "Session Destroyed" error on join - Fixed in controllers/roomController.js and server.js by removing incorrect "+ Z" UTC interpretation
>>>>>>> ebbbac0 (Implement real-time typing indicator feature and fix timezone issues in room expiry)
