# ElevenLabs API Conformance (LearnPlay Podcast)

This project targets a Studio-like podcast workflow while using only public ElevenLabs APIs.

## Allowed endpoint families

- `/v1/voices`
- `/v1/models`
- `/v1/user/subscription`
- `/v1/text-to-speech/:voice_id`
- `/v1/text-to-speech/:voice_id/stream` (optional)
- `/v1/text-to-dialogue` (optional)
- `/v1/history/*` (optional retrieval/audit use)

## Forbidden endpoint families

- Any ElevenLabs Studio API endpoint.
- Any undocumented private endpoint.

## Enforcement

- Local check: `scripts/validate-elevenlabs-endpoints.sh`
- NPM shortcut: `npm run check:elevenlabs-endpoints`

If the check fails, remove or replace non-conformant endpoints before merge.
