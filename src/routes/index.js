const express = require('express');
const router = express.Router();

router.use('/auth',           require('./authRoutes'));
router.use('/users',          require('./userRoutes'));
router.use('/workspaces',     require('./workspaceRoutes'));
router.use('/products',       require('./productRoutes'));
router.use('/batches',        require('./batchRoutes'));
router.use('/invites',        require('./inviteRoutes'));
router.use('/crops',          require('./cropRoutes'));
router.use('/certifications', require('./certificationRoutes'));
// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
 
module.exports = router;