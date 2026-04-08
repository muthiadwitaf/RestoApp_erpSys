const router = require('express').Router();

router.use('/rooms',   require('./rooms'));
router.use('/tables',  require('./tables'));
router.use('/menu',    require('./menu'));
router.use('/orders',  require('./orders'));
router.use('/kitchen', require('./kitchen'));

module.exports = router;
