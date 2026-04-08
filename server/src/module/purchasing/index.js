const router = require('express').Router();

router.use('/suppliers', require('./suppliers'));
router.use('/orders', require('./orders'));
router.use('/bills', require('./bills'));
router.use('/returns', require('./returns'));
router.use('/reports', require('./reports'));

module.exports = router;
