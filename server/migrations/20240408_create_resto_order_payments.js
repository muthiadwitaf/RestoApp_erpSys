// migrations/20240408_create_resto_order_payments.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('resto_order_payments', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      order_id: { 
        type: Sequelize.INTEGER, 
        allowNull: false, 
        references: { model: 'resto_orders', key: 'id' }, 
        onDelete: 'CASCADE' 
      },
      amount: { type: Sequelize.DECIMAL(15, 2), allowNull: false },
      method: { type: Sequelize.STRING, allowNull: false, defaultValue: 'cash' },
      cashier_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
      notes: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, defaultValue: Sequelize.literal('NOW()') }
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('resto_order_payments');
  }
};
