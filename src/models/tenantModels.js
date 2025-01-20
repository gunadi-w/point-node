/* eslint-disable */
const path = require('path');
const Sequelize = require('sequelize');
const logger = require('../config/logger');

const env = process.env.NODE_ENV || 'development';
const config = require(`${__dirname}/../config/database.js`)[env];

const modulesDir = `${__dirname}/../modules`;
const modelPaths = [
  // master
  '/master/models/allocation.model.js',
  '/master/models/branch.model.js',
  '/master/models/branchUser.model.js',
  '/master/models/customer.model.js',
  '/master/models/item.model.js',
  '/master/models/itemUnit.model.js',
  '/master/models/user.model.js',
  '/master/models/userActivity.model.js',
  '/master/models/userWarehouse.model.js',
  '/master/models/warehouse.model.js',
  '/master/models/supplier.model.js',
  // accounting
  '/accounting/models/journal.model.js',
  '/accounting/models/chartOfAccount.model.js',
  '/accounting/models/chartOfAccountGroup.model.js',
  '/accounting/models/chartOfAccountType.model.js',
  '/accounting/models/journal.model.js',
  '/accounting/models/journal.model.js',
  // auth
  '/auth/models/modelHasPermission.model.js',
  '/auth/models/modelHasRole.model.js',
  '/auth/models/permission.model.js',
  '/auth/models/role.model.js',
  '/auth/models/roleHasPermission.model.js',
  // inventory
  '/inventory/models/inventory.model.js',
  '/inventory/models/inventoryAudit.model.js',
  '/inventory/models/inventoryAuditItem.model.js',
  // inventory/stockCorrection
  '/inventory/stockCorrection/models/stockCorrection.model.js',
  '/inventory/stockCorrection/models/stockCorrectionItem.model.js',
  // sales/deliveryNote
  '/sales/deliveryNote/models/deliveryNote.model.js',
  '/sales/deliveryNote/models/deliveryNoteItem.model.js',
  // sales/deliveryOrder
  '/sales/deliveryOrder/models/deliveryOrder.model.js',
  '/sales/deliveryOrder/models/deliveryOrderItem.model.js',
  // sales/salesInvoice
  '/sales/salesInvoice/models/salesInvoice.model.js',
  '/sales/salesInvoice/models/salesInvoiceItem.model.js',
  // sales/salesOrder
  '/sales/salesOrder/models/salesOrder.model.js',
  '/sales/salesOrder/models/salesOrderItem.model.js',
  // pos
  '/pos/models/posBill.model.js',
  // purchase
  '/purchase/models/purchaseInvoice.model.js',
  '/purchase/models/purchaseDownPayment.model.js',
  '/purchase/models/purchaseReturn.model.js',
  // purchase/paymentOrder
  '/purchase/paymentOrder/models/paymentOrder.model.js',
  '/purchase/paymentOrder/models/paymentOrderDetails.model.js',
  // plugin/pinpoint
  '/plugin/pinPoint/salesVisitation.model.js',
  '/plugin/pinPoint/salesVisitationDetail.model.js',
  // shared
  '/shared/form/form.model.js',
  '/shared/settingJournal/settingJournal.model.js',
  // setting
  '/setting/models/settingLogo.model.js',
  '/setting/models/settingEndNote.model.js',
  // finance
  '/finance/payment/models/payment.model.js',
  '/finance/payment/models/paymentDetail.model.js',
].map((modelPath) => path.join(modulesDir, modelPath));

async function loadAllTenantProjectDatabase (db) {
  const { Project } = db.main;
  const projects = await Project.findAll();
  projects.forEach((project) => {
    addOrFindNewProjectDatabase(db, project.code)
  });
}

async function addOrFindNewProjectDatabase (db, projectCode) {
  if (db[projectCode]) {
    return db[projectCode]
  }
  
  db[projectCode] = {};
  const configDbTenant = generateConfigNewDatabase(projectCode)
  const newDatabaseSequelize = new Sequelize(
    configDbTenant.database,
    configDbTenant.username,
    configDbTenant.password,
    configDbTenant
  );

  modelPaths.forEach((modelPath) => {
    const model = require(modelPath)(newDatabaseSequelize, Sequelize.DataTypes, projectCode);
    db[projectCode][model.name] = model;
  });

  Object.keys(db[projectCode]).forEach((modelName) => {
    if (db[projectCode][modelName].associate) {
      db[projectCode][modelName].associate(db);
    }
  });

  db[projectCode].sequelize = newDatabaseSequelize

  return db[projectCode];
}

function generateConfigNewDatabase (projectCode) {
  const configDbTenant = config.databases.tenant;
  const database = `${process.env.DATABASE_NAME}_${projectCode.toLowerCase()}`;
  
  return {
    ...configDbTenant,
    database,
  }
}

module.exports = {
  modelPaths,
  modulesDir,
  loadAllTenantProjectDatabase,
  addOrFindNewProjectDatabase,
};
/* eslint-enable */
