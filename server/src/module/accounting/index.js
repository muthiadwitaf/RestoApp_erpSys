const router = require('express').Router();

router.use('/coa', require('./coa'));
router.use('/journals', require('./journals'));
router.use('/expenses', require('./expenses'));
router.use('/reimbursements', require('./reimbursements'));
router.use('/assets', require('./assets/index'));
router.use('/reports', require('./reports'));
router.use('/taxes', require('./taxes'));
router.use('/efaktur', require('./efaktur'));
router.use('/closing', require('./closing'));

module.exports = router;
