const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/roles', require('./roles'));
router.use('/branches', require('./branches'));
router.use('/audit', require('./audit'));
router.use('/upload', require('./upload'));
router.use('/company', require('./company'));
router.use('/margin', require('./margin'));

module.exports = router;
