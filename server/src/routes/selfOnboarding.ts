import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { SelfOnboardingController } from '../controllers/selfOnboarding.controller';
import { authenticate } from '../middleware/auth';

// -----------------------------------------------------------------------------
// This module exports TWO routers:
//   - authenticatedRouter  → mount at /truckers  (send-onboarding action)
//   - publicRouter         → mount at /public/onboarding  (form fetch + submit)
//
// Public router is intentionally UN-authenticated: truckers don't have
// TruckFlow user accounts. Authorization comes from the URL token being
// SHA-256'd and matched against trucker_onboarding_requests.token_hash.
// -----------------------------------------------------------------------------

const ctrl = new SelfOnboardingController();

// ------- Authenticated portion (mounted under /truckers) ---------------------
export const authenticatedRouter = Router();
authenticatedRouter.use(authenticate);
authenticatedRouter.post('/:id/send-onboarding', (req, res) => ctrl.send(req, res));

// ------- Public portion (mounted under /public/onboarding) -------------------
export const publicRouter = Router();

// Multipart parser for the submit endpoint. .any() so we accept an
// arbitrary set of file fields (one per doc slug the trucker uploads).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

publicRouter.get('/:token', (req, res) => ctrl.fetch(req, res));
publicRouter.post('/:token/submit', upload.any(), (req, res) => ctrl.submit(req, res));
