# OnPrem PDF Extraction Prerequisites

## Runtime Requirement
- `pdftotext` must be installed and available on PATH for PDF extraction reliability.

## Verification
```bash
which pdftotext
pdftotext -v
```

## Typical Failure Signatures
- Extraction status moves to `failed` for PDF uploads.
- Worker logs indicate missing PDF text extractor dependency.

## Operational Note
- Keep this validated on onprem DEV before running course-framework upload sweeps that include PDF fixtures.
