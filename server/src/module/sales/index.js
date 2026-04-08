const router = require('express').Router();

router.use('/customers', require('./customers'));
router.use('/orders', require('./orders'));
router.use('/invoices', require('./invoices'));
router.use('/pos', require('./pos'));
router.use('/pos-settings', require('./pos_settings'));
router.use('/pos-sessions', require('./pos_sessions'));
router.use('/returns', require('./returns'));

router.use('/bundles', require('./bundles'));
router.use('/consignments', require('./consignments'));
router.use('/pricelist', require('./pricelist'));
router.use('/reports',   require('./reports'));

module.exports = router;
