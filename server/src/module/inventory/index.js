const router = require('express').Router();

router.use('/items', require('./items'));
router.use('/categories', require('./categories'));
router.use('/units', require('./units'));
router.use('/warehouses', require('./warehouses'));
router.use('/stock', require('./stock'));
router.use('/receives', require('./receives'));
router.use('/issues', require('./issues'));
router.use('/transfers', require('./transfers'));
router.use('/opnames', require('./opnames'));
router.use('/batches', require('./batches'));
router.use('/bins', require('./bins'));
router.use('/deliveries', require('./deliveries'));
router.use('/reports', require('./reports'));

module.exports = router;
