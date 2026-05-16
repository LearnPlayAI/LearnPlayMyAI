# Certificate Policy

As of April 6, 2026, LearnPlay issues **course completion certificates only**.

## Rules

- Lesson certificates are deprecated and fully removed from runtime behavior.
- Certificates are issued only when course completion eligibility is met.
- Certificate delivery, download, sharing, and verification flows apply only to course certificates.

## Engineering Notes

- Certificate APIs and UI surfaces now operate on course certificates only.
- Schema and migrations remove lesson-certificate data shape and legacy enum value usage.
