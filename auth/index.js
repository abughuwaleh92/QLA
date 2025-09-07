// auth/index.js — Google OAuth with enhanced debugging
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
let PgStore = null; 
try { 
  PgStore = require('connect-pg-simple')(session); 
} catch {}

function mountAuth(app, pool) {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_CALLBACK_URL,
    COOKIE_SECRET,
    ALLOWED_GOOGLE_DOMAIN = 'qla.qfschools.qa',
    TEACHER_EMAILS = '',
    ADMIN_EMAILS = ''
  } = process.env;

  // Debug logging
  console.log('🔐 Auth Configuration:');
  console.log('   Client ID:', GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('   Client Secret:', GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('   Callback URL:', OAUTH_CALLBACK_URL || '❌ Missing');
  console.log('   Allowed Domain:', ALLOWED_GOOGLE_DOMAIN);
  console.log('   Environment:', process.env.NODE_ENV || 'development');

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_CALLBACK_URL || !COOKIE_SECRET) {
    console.error('⚠️  CRITICAL: Missing required OAuth environment variables!');
    console.error('   Please set: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_CALLBACK_URL, COOKIE_SECRET');
    
    // Provide a helpful error page instead of crashing
    app.get('/auth/google', (req, res) => {
      res.status(500).send(`
        <h1>OAuth Configuration Error</h1>
        <p>The application is not properly configured for Google OAuth.</p>
        <h2>Required Environment Variables:</h2>
        <ul>
          <li>GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing'}</li>
          <li>GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}</li>
          <li>OAUTH_CALLBACK_URL: ${OAUTH_CALLBACK_URL ? '✅ Set (' + OAUTH_CALLBACK_URL + ')' : '❌ Missing'}</li>
          <li>COOKIE_SECRET: ${COOKIE_SECRET ? '✅ Set' : '❌ Missing'}</li>
        </ul>
        <p>Please configure these in Railway's environment variables.</p>
      `);
    });
    return;
  }

  // Session configuration
  app.set('trust proxy', 1);
  const sessionConfig = {
    store: (PgStore && pool) ? new PgStore({ 
      pool, 
      tableName: 'session', 
      createTableIfMissing: true 
    }) : undefined,
    secret: COOKIE_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  };

  app.use(session(sessionConfig));

  // Passport configuration
  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: OAUTH_CALLBACK_URL,
    passReqToCallback: true
  }, (req, accessToken, refreshToken, params, profile, done) => {
    try {
      console.log('🔐 OAuth callback received for:', profile.emails?.[0]?.value);
      
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value || '').toLowerCase();
      const hd = profile._json && profile._json.hd || null;
      const allowed = ALLOWED_GOOGLE_DOMAIN.toLowerCase();
      const teacherEmails = new Set((TEACHER_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
      const adminEmails = new Set((ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));

      // Check domain restriction
      if (!email.endsWith('@' + allowed) && (!hd || hd.toLowerCase() !== allowed)) {
        console.log('❌ Unauthorized domain:', email, 'Expected:', allowed);
        return done(null, false, { message: 'Unauthorized domain. Only @' + allowed + ' emails are allowed.' });
      }

      // Determine role
      const role = adminEmails.has(email) ? 'admin' : (teacherEmails.has(email) ? 'teacher' : 'student');
      
      const user = {
        id: profile.id,
        email,
        name: profile.displayName || email,
        picture: (profile.photos && profile.photos[0] && profile.photos[0].value) || null,
        role,
        is_admin: role === 'admin'
      };

      console.log('✅ User authenticated:', email, 'Role:', role);
      return done(null, user);
    } catch (e) {
      console.error('❌ OAuth error:', e);
      return done(e);
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Login page with helpful debugging info
  app.get('/login', (req, res) => {
    const error = req.query.error;
    let errorMessage = '';
    
    if (error === 'unauthorized') {
      errorMessage = `<div class="bg-red-100 text-red-700 p-4 rounded-lg mb-4">
        <strong>Access Denied:</strong> Only @${ALLOWED_GOOGLE_DOMAIN} email addresses are allowed.
      </div>`;
    }

    res.send(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>QLA • Sign in</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
        <style>
          :root { --maroon: #6C1D45; --maroon2: #8B2450; --bg: #F7FAFC; --line: #e9eef2 }
          .card { background: #fff; border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 20px 40px rgba(0,0,0,.08) }
        </style>
      </head>
      <body class="min-h-screen flex items-center justify-center p-6" style="background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">
        <div class="card max-w-md w-full p-8 text-center">
          <div class="w-16 h-16 bg-[var(--maroon)] rounded-lg mx-auto mb-4 flex items-center justify-center text-white font-bold text-xl">QLA</div>
          <h1 class="text-2xl font-extrabold mb-2">Sign in to QLA Mathematics</h1>
          <p class="text-slate-600 mb-6">Access is restricted to <strong>${ALLOWED_GOOGLE_DOMAIN}</strong> accounts.</p>
          ${errorMessage}
          <a href="/auth/google" class="inline-flex items-center justify-center gap-3 bg-[var(--maroon)] hover:bg-[var(--maroon2)] text-white font-semibold px-6 py-3 rounded-lg transition-colors">
            <i class="fab fa-google"></i> Sign in with Google
          </a>
          <p class="text-xs text-slate-500 mt-6">By continuing you agree to our acceptable use policy.</p>
          
          <!-- Debug info (remove in production) -->
          ${process.env.NODE_ENV !== 'production' ? `
            <div class="mt-6 p-4 bg-gray-100 rounded text-left text-xs">
              <strong>Debug Info:</strong><br>
              Callback URL: ${OAUTH_CALLBACK_URL}<br>
              Environment: ${process.env.NODE_ENV || 'development'}<br>
              Domain: ${ALLOWED_GOOGLE_DOMAIN}
            </div>
          ` : ''}
        </div>
      </body>
      </html>`);
  });

  // OAuth routes
  app.get('/auth/google', (req, res, next) => {
    // Store where to redirect after login
    req.session.returnTo = req.query.r || '/portal/student';
    
    console.log('🔐 Initiating OAuth flow...');
    console.log('   Callback URL:', OAUTH_CALLBACK_URL);
    
    next();
  }, passport.authenticate('google', {
    scope: ['openid', 'email', 'profile'],
    hd: ALLOWED_GOOGLE_DOMAIN,
    prompt: 'select_account'
  }));

  app.get('/auth/google/callback',
    passport.authenticate('google', {
      failureRedirect: '/login?error=unauthorized'
    }),
    (req, res) => {
      console.log('✅ Login successful for:', req.user?.email);
      
      // Redirect based on role
      const dest = req.session.returnTo || (
        req.user.role === 'admin' ? '/portal/admin' :
        req.user.role === 'teacher' ? '/portal/teacher' :
        '/portal/student'
      );
      
      delete req.session.returnTo;
      res.redirect(dest);
    }
  );

  // Logout
  app.post('/auth/logout', (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid');
        res.json({ ok: true });
      });
    });
  });

  // Get current user
  app.get('/api/auth/me', (req, res) => {
    res.json({ user: req.user || null });
  });

  console.log('✅ Authentication system configured successfully');
}

// Middleware functions
function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  if (req.user) return next();
  
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'auth_required' });
  }
  
  return res.redirect('/login?r=' + encodeURIComponent(req.originalUrl || '/'));
}

function requireTeacher(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role === 'teacher' || req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'teacher_only' });
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'auth_required' });
  if (req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'admin_only' });
}

module.exports = { mountAuth, requireAuth, requireTeacher, requireAdmin };
