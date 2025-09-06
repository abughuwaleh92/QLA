// auth/index.js — Google OAuth for qla.qfschools.qa
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
let PgStore = null; try { PgStore = require('connect-pg-simple')(session); } catch {}

function mountAuth(app, pool){
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_CALLBACK_URL,
    COOKIE_SECRET,
    ALLOWED_GOOGLE_DOMAIN = 'qla.qfschools.qa',
    TEACHER_EMAILS = ''
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_CALLBACK_URL || !COOKIE_SECRET) {
    console.warn('⚠️  Missing Google OAuth env vars.');
  }

  app.set('trust proxy', 1);

  const sess = {
    store: (PgStore && pool) ? new PgStore({ pool, tableName: 'session', createTableIfMissing: true }) : undefined,
    secret: COOKIE_SECRET || 'change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly:true, secure:true, sameSite:'lax', maxAge: 1000*60*60*24*7 }
  };
  app.use(session(sess));

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID, clientSecret: GOOGLE_CLIENT_SECRET, callbackURL: OAUTH_CALLBACK_URL
  }, (accessToken, refreshToken, params, profile, done) => {
    try {
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value || '').toLowerCase();
      const hd = profile._json && profile._json.hd || null;
      const allowed = (process.env.ALLOWED_GOOGLE_DOMAIN || 'qla.qfschools.qa').toLowerCase();
      const teacherEmails = new Set((process.env.TEACHER_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean));
      if (!email.endsWith('@'+allowed) && (!hd || hd.toLowerCase()!==allowed)) {
        return done(null, false, { message: 'Unauthorized domain' });
      }
      const user = { id: profile.id, email, name: profile.displayName || email, picture: (profile.photos && profile.photos[0] && profile.photos[0].value) || null, role: teacherEmails.has(email)?'teacher':'student' };
      return done(null, user);
    } catch(e){ return done(e); }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  app.get('/login', (req,res)=>{
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>QLA • Sign in</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
      <style>:root{--maroon:#6C1D45;--maroon2:#8B2450;--bg:#F7FAFC;--line:#e9eef2}.card{background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 20px 40px rgba(0,0,0,.08)}</style>
      </head><body class="min-h-screen flex items-center justify-center p-6">
      <div class="card max-w-md w-full p-8 text-center"><div class="w-16 h-16 bg-[var(--maroon)] rounded-lg mx-auto mb-4 flex items-center justify-center text-white font-bold text-xl">QLA</div>
      <h1 class="text-2xl font-extrabold mb-2">Sign in to QLA Mathematics</h1>
      <p class="text-slate-600 mb-6">Access is restricted to <strong>${ALLOWED_GOOGLE_DOMAIN}</strong> accounts.</p>
      <a href="/auth/google" class="inline-flex items-center justify-center gap-3 bg-[var(--maroon)] hover:bg-[var(--maroon2)] text-white font-semibold px-6 py-3 rounded-lg transition-colors">
      <i class="fab fa-google"></i> Sign in with Google</a>
      <p class="text-xs text-slate-500 mt-6">By continuing you agree to our acceptable use policy.</p></div></body></html>`);
  });

  app.get('/auth/google', (req,res,next)=>{ req.session.returnTo = req.query.r || '/portal/student'; next(); },
    passport.authenticate('google', { scope: ['openid','email','profile'], hd: ALLOWED_GOOGLE_DOMAIN, prompt: 'select_account' })
  );
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login?error=unauthorized' }),
    (req,res)=>{ const dest = req.session.returnTo || (req.user.role==='teacher'?'/portal/teacher':'/portal/student'); delete req.session.returnTo; res.redirect(dest); }
  );
  app.post('/auth/logout', (req,res)=>{ req.logout(()=>{ req.session.destroy(()=>{ res.clearCookie('connect.sid'); res.json({ ok:true });});}); });
  app.get('/api/auth/me', (req,res)=> res.json({ user: req.user || null }));
}

function requireAuth(req,res,next){
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  if (req.user) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error:'auth_required' });
  return res.redirect('/login?r='+encodeURIComponent(req.originalUrl||'/'));
}
function requireTeacher(req,res,next){
  if (!req.user) return res.status(401).json({ error:'auth_required' });
  if (req.user.role === 'teacher') return next();
  return res.status(403).json({ error:'teacher_only' });
}

module.exports = { mountAuth, requireAuth, requireTeacher };
