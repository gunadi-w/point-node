const nodemailer = require('nodemailer');
const logger = require('@src/config/logger');
const tenantDatabase = require('@src/models').tenant;
const Mailer = require('@src/utils/Mailer');
const factory = require('@root/tests/utils/factory');
const ProcessSendCreateApproval = require('./ProcessSendCreateApproval');

jest.mock('nodemailer');

nodemailer.createTransport.mockReturnValue({
  sendMail: jest.fn().mockReturnValue({ messageId: '1' }),
});

describe('Process Send Create Approval', () => {
  let stockCorrection, stockCorrectionForm, stockCorrectionItem, item, tenantName;
  beforeEach(async (done) => {
    tenantName = tenantDatabase.sequelize.config.database.replace('point_', '');
    const recordFactories = await generateRecordFactories();
    ({ stockCorrection, stockCorrectionForm, stockCorrectionItem, item } = recordFactories);

    done();
  });

  it('send mailer', async () => {
    const mailerSpy = jest.spyOn(Mailer.prototype, 'call');
    const loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    await new ProcessSendCreateApproval(tenantName, stockCorrection.id).call();
    expect(mailerSpy).toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalled();
  });

  it('send mailer with require production number and expiry date', async () => {
    const mailerSpy = jest.spyOn(Mailer.prototype, 'call');
    const loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    await item.update({ requireProductionNumber: true, requireExpiryDate: true });
    await stockCorrectionItem.update({ productionNumber: '001', expiryDate: new Date('2022-03-01') });
    await new ProcessSendCreateApproval(tenantName, stockCorrection.id).call();
    expect(mailerSpy).toHaveBeenCalled();
    expect(loggerInfoSpy).toHaveBeenCalled();
  });

  it('not send mailer if stock correction not in pending', async () => {
    await stockCorrectionForm.update({ approvalStatus: 1 });
    const loggerInfoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    await new ProcessSendCreateApproval(tenantName, stockCorrection.id).call();
    expect(loggerInfoSpy).not.toHaveBeenCalled();
  });

  it('calls logger error when mailer failed', async () => {
    nodemailer.createTransport.mockReturnValue({
      sendMail: jest.fn().mockRejectedValue('error'),
    });
    const loggerErrorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    await new ProcessSendCreateApproval(tenantName, stockCorrection.id).call();
    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});

const generateRecordFactories = async ({
  maker,
  approver,
  branch,
  warehouse,
  item,
  stockCorrection,
  stockCorrectionItem,
  stockCorrectionForm,
} = {}) => {
  const chartOfAccountType = await tenantDatabase.ChartOfAccountType.create({
    name: 'cost of sales',
    alias: 'beban pokok penjualan',
    isDebit: true,
  });
  const chartOfAccount = await tenantDatabase.ChartOfAccount.create({
    typeId: chartOfAccountType.id,
    position: 'DEBIT',
    name: 'COST OF SALES',
    alias: 'BEBAN SELISIH PERSEDIAAN',
  });

  maker = await factory.user.create(maker);
  approver = await factory.user.create(approver);
  branch = await factory.branch.create(branch);
  warehouse = await factory.warehouse.create({ branch, ...warehouse });
  item = await factory.item.create({ chartOfAccount, ...item });
  stockCorrection = await factory.stockCorrection.create({ warehouse, ...stockCorrection });
  stockCorrectionItem = await factory.stockCorrectionItem.create({
    stockCorrection,
    quantity: 10,
    item,
  });
  stockCorrectionForm = await factory.form.create({
    branch,
    createdBy: maker.id,
    updatedBy: maker.id,
    requestApprovalTo: approver.id,
    formable: stockCorrection,
    formableType: 'StockCorrection',
    number: 'SC2101001',
  });

  await tenantDatabase.SettingJournal.create({
    feature: 'stock correction',
    name: 'difference stock expenses',
    description: 'difference stock expenses',
    chartOfAccountId: chartOfAccount.id,
  });

  return {
    maker,
    approver,
    branch,
    warehouse,
    item,
    stockCorrection,
    stockCorrectionItem,
    stockCorrectionForm,
  };
};
