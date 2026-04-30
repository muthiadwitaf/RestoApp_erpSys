/**
 * BE/src/module/accounting/assets/index.js
 * Router aggregator -- Asset Management module
 *
 * Mount order KRITIS:
 *   1. /categories  -- literal path, sebelum /:uuid
 *   2. reports      -- /report dan /:uuid/schedule, sebelum crud /:uuid
 *   3. lifecycle    -- /:uuid/post, /:uuid/depreciate, dll
 *   4. crud         -- GET /:uuid, POST /, PUT /:uuid, DELETE /:uuid
 */
const router = require('express').Router();
const {  } = require('../../../middleware/auth');

router.use('/categories', require('./categories'));
router.use('/',           require('./reports'));    // /report & /:uuid/schedule -- BEFORE crud
router.use('/',           require('./photos'));     // /:uuid/photos
router.use('/',           require('./documents')); // /:uuid/documents
router.use('/',           require('./location'));  // /:uuid/location
router.use('/',           require('./lifecycle'));
router.use('/',           require('./crud'));

module.exports = router;

