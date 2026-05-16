import express from 'express';
import path from 'path';

const router = express.Router();

// Serve static files from test output directory
const testOutputDir = path.join(process.cwd(), 'server/tests/output');

router.use('/test-viewer', express.static(testOutputDir));

export default router;
