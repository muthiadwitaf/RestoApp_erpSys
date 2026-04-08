// migrations/20240408_create_sales_order_payments.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('sales_order_payments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'sales_orders', key: 'id' }, onDelete: 'CASCADE' },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      method: { type: Sequelize.STRING, allowNull: false, defaultValue: 'cash' },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('sales_order_payments');
  }
};
