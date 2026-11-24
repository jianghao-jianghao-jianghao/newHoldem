## Summary

- What changed and why?
- Closes #<issue-number> (if applicable)

## Architecture & Compatibility Checklist

- [ ] **CPU-Only Verified**: Runs cleanly without GPU dependencies during dev, test, and Docker deployment.
- [ ] **Guest & Auth Flow**: Preserves zero-login guest seating/room hosting and pure email OTP authentication.
- [ ] **Security & Redaction**: Unrevealed hole cards are never leaked in WS broadcasts, REST responses, or SQLite replays.
- [ ] **Tests & Build**: `npm run lint`, `npm test`, and `npm run build` all pass locally.
- [ ] **No Secrets / Scratch Artifacts**: No `.env`, SQLite files, videos, or temporary scripts included.
