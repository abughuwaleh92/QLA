// auth/index.js — Fixed Google OAuth with Robust Session Handling
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

function mountAuth(app, pool) {
  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_CALLBACK_URL,
    COOKIE_SECRET,
    ALLOWED_GOOGLE_DOMAIN = 'qla.qfschools.qa',
    TEACHER_EMAILS = '',
    ADMIN_EMAILS = '',
    SESSION_NAME = 'qla.sid',
    NODE_ENV = 'production'
  } = process.env;

  // Debug logging
  console.log('🔐 Auth Configuration:');
  console.log('   Client ID:', GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing');
  console.log('   Client Secret:', GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing');
  console.log('   Callback URL:', OAUTH_CALLBACK_URL || '❌ Missing');
  console.log('   Allowed Domain:', ALLOWED_GOOGLE_DOMAIN);
  console.log('   Environment:', NODE_ENV);

  // Check required variables
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !OAUTH_CALLBACK_URL || !COOKIE_SECRET) {
    console.error('⚠️  CRITICAL: Missing required OAuth environment variables!');
    console.error('   Please set: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_CALLBACK_URL, COOKIE_SECRET');
    
    // Provide error page instead of crashing
    app.get('/auth/google', (req, res) => {
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Configuration Error</title>
          <style>
            body { font-family: system-ui; padding: 40px; max-width: 600px; margin: 0 auto; }
            .error { background: #fee; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .status { margin: 10px 0; }
            .ok { color: green; }
            .fail { color: red; }
          </style>
        </head>
        <body>
          <h1>OAuth Configuration Error</h1>
          <div class="error">
            <h2>Required Environment Variables:</h2>
            <div class="status ${GOOGLE_CLIENT_ID ? 'ok' : 'fail'}">
              GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Missing'}
            </div>
            <div class="status ${GOOGLE_CLIENT_SECRET ? 'ok' : 'fail'}">
              GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ Missing'}
            </div>
            <div class="status ${OAUTH_CALLBACK_URL ? 'ok' : 'fail'}">
              OAUTH_CALLBACK_URL: ${OAUTH_CALLBACK_URL ? '✅ Set' : '❌ Missing'}
            </div>
            <div class="status ${COOKIE_SECRET ? 'ok' : 'fail'}">
              COOKIE_SECRET: ${COOKIE_SECRET ? '✅ Set' : '❌ Missing'}
            </div>
          </div>
          <p>Please configure these in Railway's environment variables.</p>
        </body>
        </html>
      `);
    });
    
    // Set up minimal auth bypass for development
    if (NODE_ENV === 'development') {
      console.log('⚠️  Development mode: Setting up mock authentication');
      app.use((req, res, next) => {
        if (!req.user && req.path.startsWith('/portal')) {
          req.user = {
            id: 'dev-user',
            email: 'dev@qla.qfschools.qa',
            name: 'Development User',
            role: 'admin',
            is_admin: true
          };
        }
        next();
      });
    }
    
    return;
  }

  // Session Store Configuration with fallback
  let sessionStore = undefined;
  let storeType = 'memory';
  
  if (pool) {
    try {
      const PgStore = require('connect-pg-simple')(session);
      sessionStore = new PgStore({ 
        pool, 
        tableName: 'session',
        createTableIfMissing: true,
        pruneSessionInterval: 60 * 60, // Prune every hour
        errorLog: (error) => {
          // Only log non-connection errors
          if (!error.message?.includes('ECONNREFUSED')) {
            console.error('Session store error:', error.message);
          }
        }
      });
      
      // Test the store
      sessionStore.pruneSessions((err) => {
        if (err) {
          console.warn('⚠️  Session store test failed, falling back to memory');
          sessionStore = undefined;
        } else {
          storeType = 'postgresql';
          console.log('✅ PostgreSQL session store configured');
        }
      });
      
    } catch (err) {
      console.warn('⚠️  PostgreSQL session store not available:', err.message);
      console.warn('   Using memory store (sessions will be lost on restart)');
    }
  } else {
    console.warn('⚠️  No database pool provided, using memory store');
  }

  // Session configuration
  app.set('trust proxy', 1);
  
  const sessionConfig = {
    name: SESSION_NAME,
    secret: COOKIE_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Reset expiry on activity
    cookie: {
      httpOnly: true,
      secure: NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'lax',
      maxAge: parseInt(process.env.SESSION_TIMEOUT) || 7 * 24 * 60 * 60 * 1000 // 7 days
    }
  };

  // Only add store if available
  if (sessionStore) {
    sessionConfig.store = sessionStore;
    
    // Add error handling for the store
    sessionStore.on('error', (error) => {
      console.error('Session store error:', error.message);
      // Don't crash the app on session errors
    });
  }

  // Apply session middleware
  app.use(session(sessionConfig));
  console.log(`📝 Session store: ${storeType}`);

  // Passport configuration
  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((obj, done) => {
    done(null, obj);
  });

  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: OAUTH_CALLBACK_URL,
    passReqToCallback: true
  }, (req, accessToken, refreshToken, params, profile, done) => {
    try {
      console.log('🔐 OAuth callback for:', profile.emails?.[0]?.value);
      
      const email = (profile.emails?.[0]?.value || '').toLowerCase();
      const hd = profile._json?.hd || null;
      const allowed = ALLOWED_GOOGLE_DOMAIN.toLowerCase();
      
      // Parse teacher and admin emails
      const teacherEmails = new Set(
        TEACHER_EMAILS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      );
      const adminEmails = new Set(
        ADMIN_EMAILS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
      );

      // Check domain restriction
      if (!email.endsWith('@' + allowed) && (!hd || hd.toLowerCase() !== allowed)) {
        console.log('❌ Unauthorized domain:', email, 'Expected:', allowed);
        return done(null, false, { 
          message: `Unauthorized domain. Only @${allowed} emails are allowed.` 
        });
      }

      // Determine role
      let role = 'student';
      if (adminEmails.has(email)) {
        role = 'admin';
      } else if (teacherEmails.has(email)) {
        role = 'teacher';
      }
      
      const user = {
        id: profile.id,
        email,
        name: profile.displayName || email,
        picture: profile.photos?.[0]?.value || null,
        role,
        is_admin: role === 'admin',
        domain: hd || allowed
      };

      console.log('✅ User authenticated:', email, 'Role:', role);
      
      // Store user in database if pool is available
      if (pool) {
        pool.query(
          `INSERT INTO users (email, name, role, google_id, last_login) 
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (email) DO UPDATE 
           SET name = EXCLUDED.name, 
               last_login = NOW()`,
          [email, user.name, role, profile.id]
        ).catch(err => {
          // User table might not exist, that's okay
          if (!err.message.includes('does not exist')) {
            console.error('Failed to store user:', err.message);
          }
        });
      }
      
      return done(null, user);
    } catch (e) {
      console.error('❌ OAuth error:', e);
      return done(e);
    }
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  // Add session recovery middleware
  app.use((req, res, next) => {
    // If session exists but user doesn't, try to recover
    if (req.session && req.session.passport && !req.user) {
      req.user = req.session.passport.user;
    }
    next();
  });

  // Login page
  app.get('/login', (req, res) => {
    const error = req.query.error;
    let errorMessage = '';
    
    if (error === 'unauthorized') {
      errorMessage = `
        <div style="background: #fee; padding: 15px; border-radius: 8px; margin: 20px 0; color: #c00;">
          <strong>Access Denied:</strong> Only @${ALLOWED_GOOGLE_DOMAIN} email addresses are allowed.
        </div>
      `;
    } else if (error === 'session') {
      errorMessage = `
        <div style="background: #fef0e0; padding: 15px; border-radius: 8px; margin: 20px 0; color: #a60;">
          <strong>Session Expired:</strong> Please sign in again.
        </div>
      `;
    }

    res.send(`<!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>QLA • Sign in</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
        <style>
          :root { --maroon: #6C1D45; --maroon2: #8B2450; --gold: #C7A34F; }
          body { 
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
          }
          .card { 
            background: white; 
            border-radius: 18px; 
            box-shadow: 0 20px 40px rgba(0,0,0,.08);
          }
        </style>
      </head>
      <body class="flex items-center justify-center p-6">
        <div class="card max-w-md w-full p-8 text-center">
          <div class="w-16 h-16 bg-[var(--maroon)] rounded-lg mx-auto mb-4 flex items-center justify-center text-white font-bold text-xl">QLA</div>
          <h1 class="text-2xl font-extrabold mb-2">Sign in to QLA Mathematics</h1>
          <p class="text-slate-600 mb-6">Access restricted to <strong>${ALLOWED_GOOGLE_DOMAIN}</strong> accounts.</p>
          
          ${errorMessage}
          
          <a href="/auth/google" class="inline-flex items-center justify-center gap-3 bg-[var(--maroon)] hover:bg-[var(--maroon2)] text-white font-semibold px-6 py-3 rounded-lg transition-colors">
            <i class="fab fa-google"></i> Sign in with Google
          </a>
          
          <p class="text-xs text-slate-500 mt-6">
            By signing in, you agree to our terms of service.<br>
            ${storeType === 'memory' ? '<small>⚠️ Sessions are temporary (memory store active)</small>' : ''}
          </p>
          
          ${NODE_ENV !== 'production' ? `
            <div class="mt-6 p-4 bg-gray-100 rounded text-left text-xs">
              <strong>Debug Info:</strong><br>
              Callback: ${OAUTH_CALLBACK_URL}<br>
              Environment: ${NODE_ENV}<br>
              Domain: ${ALLOWED_GOOGLE_DOMAIN}<br>
              Session Store: ${storeType}
            </div>
          ` : ''}
        </div>
      </body>
      </html>`);
  });

  // OAuth routes
  app.get('/auth/google', (req, res, next) => {
    // Store return URL
    req.session.returnTo = req.query.r || req.headers.referer || '/portal/student';
    
    console.log('🔐 Initiating OAuth flow...');
    console.log('   Return to:', req.session.returnTo);
    
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
      
      // Determine redirect destination
      const dest = req.session.returnTo || (
        req.user.role === 'admin' ? '/portal/admin' :
        req.user.role === 'teacher' ? '/portal/teacher' :
        '/portal/student'
      );
      
      delete req.session.returnTo;
      
      // Save session before redirect
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
        }
        res.redirect(dest);
      });
    }
  );

  // Logout route
  app.post('/auth/logout', (req, res) => {
    const email = req.user?.email;
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
      }
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destroy error:', err);
        }
        res.clearCookie(SESSION_NAME);
        console.log('👋 User logged out:', email);
        res.json({ ok: true });
      });
    });
  });

  // Alternative GET logout for convenience
  app.get('/auth/logout', (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie(SESSION_NAME);
        res.redirect('/');
      });
    });
  });

  // Get current user
  app.get('/api/auth/me', (req, res) => {
    res.json({ 
      user: req.user || null,
      session: {
        store: storeType,
        expires: req.session?.cookie?.expires
      }
    });
  });

  // Session check endpoint
  app.get('/api/auth/check', (req, res) => {
    if (req.user) {
      res.json({ 
        authenticated: true, 
        user: req.user,
        sessionId: req.sessionID
      });
    } else {
      res.status(401).json({ 
        authenticated: false,
        message: 'Not authenticated'
      });
    }
  });

  console.log('✅ Authentication system configured');
  console.log(`   Session store: ${storeType}`);
  console.log(`   Domain restriction: @${ALLOWED_GOOGLE_DOMAIN}`);
}

// Middleware functions with better error handling
function requireAuth(req, res, next) {
  // Check multiple auth indicators
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  
  if (req.user) {
    return next();
  }
  
  // Check session for user
  if (req.session?.passport?.user) {
    req.user = req.session.passport.user;
    return next();
  }
  
  // API calls get JSON response
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ 
      error: 'auth_required',
      message: 'Authentication required'
    });
  }
  
  // Web pages get redirected to login
  const returnUrl = encodeURIComponent(req.originalUrl || '/');
  return res.redirect(`/login?r=${returnUrl}`);
}

function requireTeacher(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'auth_required',
      message: 'Authentication required'
    });
  }
  
  if (req.user.role === 'teacher' || req.user.role === 'admin') {
    return next();
  }
  
  return res.status(403).json({ 
    error: 'teacher_only',
    message: 'Teacher or admin access required'
  });
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'auth_required',
      message: 'Authentication required'
    });
  }
  
  if (req.user.role === 'admin' || req.user.is_admin) {
    return next();
  }
  
  return res.status(403).json({ 
    error: 'admin_only',
    message: 'Admin access required'
  });
}

module.exports = { 
  mountAuth, 
  requireAuth, 
  requireTeacher, 
  requireAdmin 
};
