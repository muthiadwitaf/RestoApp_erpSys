// migrations/20240408_add_kitchen_status_to_orders.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('sales_orders', 'kitchen_status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'PENDING' // default when order is sent to kitchen
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('sales_orders', 'kitchen_status');
  }
};
