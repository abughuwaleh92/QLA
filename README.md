# QLA Mathematics Platform (Extended, Railway-ready)

Complete Student + Teacher + Admin portals (QMaroon style), Google OAuth restricted to **qla.qfschools.qa**, interactive lessons (Grade 7 & 8), lesson builder, assignments, assessments, classroom mode, classes/rosters (CSV import), student progress tracking, and optional Google Classroom connector.

## Deploy on Railway

1. Create a new Railway Node.js service. Upload this folder.
2. Set environment variables:
```
NODE_ENV=production
DATABASE_URL=postgres://<user>:<pass>@<host>:<port>/<db>
PGSSL=disable                      # or omit if your DB requires SSL verify
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_CALLBACK_URL=https://<your-app>.up.railway.app/auth/google/callback
COOKIE_SECRET=<32+ random>
ALLOWED_GOOGLE_DOMAIN=qla.qfschools.qa
TEACHER_EMAILS=2ed944@qla.qfschools.qa,2hg662@qla.qfschools.qa
ADMIN_EMAILS=2ed944@qla.qfschools.qa
# Optional Google Classroom
GC_SERVICE_ACCOUNT={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}
GC_IMPERSONATE_USER=admin@qla.qfschools.qa
GC_SCOPES=https://www.googleapis.com/auth/admin.directory.user.readonly https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.courses.readonly
```
3. Deploy. The app runs migrations automatically, **imports your grade7/grade8 HTML lessons**, **seeds question banks** (5 items per lesson), and **creates default classes** (G7, G8).

## URLs
- `/portal/student` — Student portal (auth required)
- `/portal/teacher` — Teacher portal (auth + teacher or admin)
- `/portal/admin` — Admin portal (auth + admin)

## Notes
- Lessons are loaded in an iframe; `/public/js/lesson-bridge.js` is injected automatically to track progress & completion.
- Teacher can create/edit lessons with HTML builder and upload/link videos.
- Assignments are by class code; use **Classes** tab to create classes and enroll students.
- Assessments: default banks are auto-created for each lesson. You can create custom banks via `POST /api/assessments`.
- Optional: import rosters from **Admin → CSV** or connect **Google Classroom** (if service account is configured).
