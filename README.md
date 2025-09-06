# QLA Mathematics Platform (Railway-ready)

**Complete Student + Teacher portals**, Google OAuth restricted to **qla.qfschools.qa**, **interactive lessons** (Grade 7 & 8), **lesson builder**, **assignments**, **assessments**, **classroom mode**, and **student progress tracking**.

## Deploy on Railway

1. Create a new Railway project (Node.js). Upload this repo.
2. Set environment variables:
```
NODE_ENV=production
PGSSL=disable                 # or leave unset if your DB needs SSL verify
DATABASE_URL=postgres://...   # Railway PG
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
OAUTH_CALLBACK_URL=https://<your-app>.up.railway.app/auth/google/callback
COOKIE_SECRET=<32+ random chars>
ALLOWED_GOOGLE_DOMAIN=qla.qfschools.qa
TEACHER_EMAILS=2ed944@qla.qfschools.qa,2hg662@qla.qfschools.qa
```
3. Deploy. The app runs migrations automatically and imports lessons from `/grade7` & `/grade8`.

## URLs

- **/portal/student** — Student portal (requires Google sign-in)
- **/portal/teacher** — Teacher portal (requires Google sign-in + teacher role)
- **/login** — Sign-in page

## Static lesson folders

- `/grade7` and `/grade8` contain the attached lesson HTML files. They are served at:
  - `/lessons/grade7/<file>` and `/lessons/grade8/<file>`
- The student portal loads lessons into an iframe and injects `/js/lesson-bridge.js` to capture progress.

## Data model (Postgres)

- `lessons` — metadata + optional `html_content` and `html_path`
- `assignments` — class_code + pass_pct + due date
- `question_banks`, `questions`, `assessments`, `assessment_attempts` — flexible question types
- `progress`, `progress_events` — completion + granular events from the lesson bridge
- `session` — created by `connect-pg-simple` automatically

## Authoring workflow (Teacher)

1. **Create Lesson**: Provide title/grade/unit/order, paste interactive HTML (math widgets allowed), upload or link video.
2. **Preview**: The preview injects the lesson bridge for progress events.
3. **Save**: Lesson becomes available in Student portal. (If you map to a static file, set `html_path` to that file.)
4. **Assign**: Choose lesson, set class code, pass %, due date.
5. **Classroom Mode**: Start broadcast with a class code and push students to a specific lesson ID (e.g., `7-1-2`).

## Assessment types

- `mcq` (single choice), `multi` (multiple choice), `tf` (true/false)
- `num` (numeric with tolerance), `text` (short answer; accepted keywords)

## Security

- Google OAuth strictly enforces **@qla.qfschools.qa**; other domains are rejected.
- Teacher writes are restricted by role (`TEACHER_EMAILS` list).

## Local development

```
npm install
export DATABASE_URL=postgres://user:pass@localhost:5432/qla
export GOOGLE_CLIENT_ID=...
export GOOGLE_CLIENT_SECRET=...
export OAUTH_CALLBACK_URL=http://localhost:8080/auth/google/callback
export COOKIE_SECRET=devsecret
export ALLOWED_GOOGLE_DOMAIN=qla.qfschools.qa
export TEACHER_EMAILS=you@qla.qfschools.qa
npm run dev
```

Visit `http://localhost:8080/login` → sign in → `/portal/teacher` or `/portal/student`.
