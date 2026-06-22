// ============================================================
//  src/controllers/certificationController.js
// ============================================================
const certService = require('../services/certificationService');
const { asyncHandler } = require('../middleware/errorHandler');

// GET /api/certifications/:id
const getCertification = asyncHandler(async (req, res) => {
  const cert = await certService.getCertification(req.params.id);
  res.json({ success: true, data: cert });
});

// GET /api/certifications/user
const getCertificationsByUser = asyncHandler(async (req, res) => {
  const { page, limit, search, isActive } = req.query;
  const userId = req.headers['x-user-id'];
  const result = await certService.getCertificationsByUser(userId, { page, limit, search, isActive });
  res.json({ success: true, ...result });
});

// GET /api/certifications/:id/chain
const getCertificationFromChain = asyncHandler(async (req, res) => {
  const data = await certService.getCertificationFromChain(req.params.id);
  res.json({ success: true, data });
});

// POST /api/certifications/
const issueCertificationFromPdf = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await certService.issueCertificationFromPdf(req.file, callerAddress);
  res.status(201).json({ success: true, data: result });
});

// POST /api/certifications/:id/expire
const expireCertification = asyncHandler(async (req, res) => {
  const callerAddress = req.headers['x-wallet-address'];
  const result = await certService.expireCertification(req.params.id, callerAddress);
  res.json({ success: true, data: result });
});

module.exports = {
  getCertification,
  getCertificationsByUser,
  getCertificationFromChain,
  issueCertificationFromPdf,
  expireCertification,
};
