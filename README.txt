# QLA Lesson Plan Generator Patch

This archive contains fully rewritten files to enable the student‑centered Lesson Plan Generator.

## Files included
- routes/lesson-plan-generator.js
- routes/lesson-plan-export.js
- public/portal-teacher.html
- server.js (with router mounts inserted)

## Apply
1) Unzip in your project root (QLA-main). It will replace the files in place.
2) Install dependency:
   npm install docx
3) Run DB migrations (safe to re-run):
   npm run migrate
4) Restart the server.

## Notes
- Routes are mounted at:
  - POST /api/lesson-plan-generator/generate
  - GET  /api/lesson-plan-generator
  - GET  /api/lesson-plan-generator/:id
  - POST /api/lesson-plan-export/export-docx
- Access is protected by requireAuth + requireTeacher.
- The new **Plan Generator** tab appears in the Teacher Portal.
