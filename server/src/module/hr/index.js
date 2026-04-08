const router = require('express').Router();

router.use('/karyawan', require('./karyawan'));
router.use('/absensi', require('./absensi'));
router.use('/setting', require('./setting'));
router.use('/claim', require('./claim'));
router.use('/employee-claims', require('./employeeClaim'));
router.use('/leave-types', require('./cuti').leaveTypes);
router.use('/leave-balances', require('./cuti').leaveBalances);
router.use('/employee-leaves', require('./cuti').employeeLeaves);
router.use('/leaves', require('./cuti').leaveAdmin);
router.use('/config', require('./hrConfig'));
router.use('/payroll', require('./payroll'));
router.use('/kasbon', require('./kasbon'));
router.use('/special-disbursements', require('./specialDisbursement'));

module.exports = router;

