# Course Framework Fixture Pack

Fixture root: `tests/fixtures/course-framework/`

## Goal
Provide deterministic upload and extraction fixtures for framework workflows, with an AI-course scenario.

## Fixture Groups
- `upload/`: source-content markdown templates for document generation.
- `extracted/`: expected extraction snapshots.
- `api/`: request payload fixtures.

## Core Flow Mapping
1. Upload source docs from `upload/`.
2. Wait for extraction completion.
3. Validate extraction shape against `extracted/`.
4. Submit framework API requests from `api/`.
5. Finalize framework, then validate lesson artifact creation.
