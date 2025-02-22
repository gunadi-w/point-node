const tenantDatabase = require('@src/models').tenant;
const factory = require('@root/tests/utils/factory');
const httpStatus = require('http-status');
const request = require('supertest');
const token = require('@src/modules/auth/services/token.service');
const app = require('@src/app');
const ProcessSendCreateApproval = require('../../workers/ProcessSendCreateApproval.worker');

jest.mock('@src/modules/auth/services/getToken.service')

jest.mock('../../workers/ProcessSendCreateApproval.worker');
beforeEach(() => {
  ProcessSendCreateApproval.mockClear();
});

describe('Payment Order - CreateFormRejectAll', () => {
  let recordFactories, createFormRequestDto, jwtoken
  beforeEach(async (done) => {
    recordFactories = await generateRecordFactories();
    createFormRequestDto = generateCreateFormRequestDto(recordFactories);
    jwtoken = token.generateToken(recordFactories.approver.id);
    const makerToken = token.generateToken(recordFactories.maker.id);
    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ makerToken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .end(done);
  });

  it('throw error if reason is empty', async () => {
    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const { approver } = recordFactories;
    const token = await generateEmailApprovalToken(paymentOrder, approver);
    const createFormRejectDto = {
      token,
      reason: null,
    };

    request(app)
      .post('/v1/purchase/payment-order/reject')
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRejectDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.BAD_REQUEST);
        expect(res.body).toMatchObject({
          message: `"reason" is required`
        })
      })
      .end(done);
  });

  it('throw error if reason more than 255 character', async () => {
    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const { approver } = recordFactories;
    const token = await generateEmailApprovalToken(paymentOrder, approver);
    const createFormRejectDto = {
      token,
      reason: faker.datatype.string(500),
    };

    request(app)
      .post('/v1/purchase/payment-order/reject')
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRejectDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.BAD_REQUEST);
        expect(res.body).toMatchObject({
          message: `"reason" length must be less than or equal to 255 characters long`
        })
      })
      .end(done);
  });

  it('throw error when rejected by unwanted user', async () => {
    const hacker = await factory.user.create();
    const { branch } = recordFactories;
    await factory.branchUser.create({ user: hacker, branch, isDefault: true });
    await factory.permission.create('purchase payment order', hacker);

    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const formPaymentOrder = await paymentOrder.getForm();
    const token = await generateEmailApprovalToken(paymentOrder, hacker);
    const createFormRejectDto = {
      token,
      reason: faker.datatype.string(20),
    };

    request(app)
      .post('/v1/purchase/payment-order/reject')
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRejectDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.FORBIDDEN);
        expect(res.body).toMatchObject({
          message: `Forbidden - You are not the selected approver for form ${formPaymentOrder.number}`
        });
      })
      .end(done);
  });

  it('success reject form', async () => {
    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const { approver } = recordFactories;
    const token = await generateEmailApprovalToken(paymentOrder, approver);
    const createFormRejectDto = {
      token,
      reason: faker.datatype.string(20),
    };

    request(app)
      .post('/v1/purchase/payment-order/reject')
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRejectDto)
      .expect('Content-Type', /json/)
      .expect(async (res) => {
        const form = await paymentOrder.getForm();
        expect(res.status).toEqual(httpStatus.OK);
        expect(res.body.data[0]).toMatchObject({
          id: paymentOrder.id,
          paymentType: paymentOrder.paymentType,
          supplierId: paymentOrder.supplierId,
          supplierName: paymentOrder.supplierName,
          amount: paymentOrder.amount,
          form: {
            id: form.id,
            branchId: form.branchId,
            date: form.date.toISOString(),
            number: form.number,
            editedNumber: form.editedNumber,
            notes: form.notes,
            editedNotes: form.editedNotes,
            createdBy: form.createdBy,
            updatedBy: form.updatedBy,
            done: form.done,
            incrementNumber: form.incrementNumber,
            incrementGroup: form.incrementGroup,
            formableId: form.formableId,
            formableType: form.formableType,
            requestApprovalTo: form.requestApprovalTo,
            approvalBy: approver.id,
            approvalAt: form.approvalAt.toISOString(),
            approvalReason: form.approvalReason,
            approvalStatus: -1,
            requestCancellationTo: form.requestCancellationTo,
            requestCancellationBy: form.requestCancellationBy,
            requestCancellationAt: form.requestCancellationAt,
            requestCancellationReason: form.requestCancellationReason,
            cancellationApprovalAt: form.cancellationApprovalAt,
            cancellationApprovalBy: form.cancellationApprovalBy,
            cancellationApprovalReason: form.cancellationApprovalReason,
            cancellationStatus: form.cancellationStatus,
          }
        });

        const paymentOrderForm = await tenantDatabase.Form.findOne({
          where: { id: res.body.data[0].form.id }
        });
        expect(paymentOrderForm).toMatchObject({
          approvalStatus: -1,
          approvalAt: expect.any(Date),
          approvalBy: approver.id,
        });

        const activity = await tenantDatabase.UserActivity.findOne({
          where: {
            number: paymentOrderForm.editedNumber,
            activity: 'Rejected By Email',
          }
        });
        expect(activity).toBeDefined();

        const { purchaseInvoice, purchaseDownPayment, purchaseReturn } = recordFactories;
        const purchaseInvoiceForm = await purchaseInvoice.getForm();
        const purchaseDownPaymentForm = await purchaseDownPayment.getForm();
        const purchaseReturnForm = await purchaseReturn.getForm();
        expect(purchaseInvoiceForm.done).toBe(false);
        expect(purchaseDownPaymentForm.done).toBe(false);
        expect(purchaseReturnForm.done).toBe(false);
      })
      .end(done);
  });

  it('check form reference pending', async () => {
    const availableInvoice = await purchaseInvoice.getAvailable();
    const availableDownPayment = await purchaseDownPayment.getAvailable();
    const availableReturn = await purchaseReturn.getAvailable();

    createFormRequestDto.invoices[0].amount = availableInvoice;
    createFormRequestDto.totalInvoiceAmount = availableInvoice;
    createFormRequestDto.downPayments[0].amount = availableDownPayment;
    createFormRequestDto.totalDownPaymentAmount = availableDownPayment;
    createFormRequestDto.returns[0].amount = availableReturn;
    createFormRequestDto.totalReturnAmount = availableReturn;
    createFormRequestDto.totalAmount = availableInvoice - 
      availableDownPayment - availableReturn - createFormRequestDto.totalOtherAmount;

    // create form done first
    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ makerToken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect(async (res, done) => {
        const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne({
          where: { id: res.body.data.id }
        });

        const { approver } = recordFactories;
        const token = await generateEmailApprovalToken(paymentOrder, approver);
        const createFormRejectDto = {
          token,
          reason: faker.datatype.string(20),
        };

        const formInvoice = await tenantDatabase.Form.findOne({
          where: {
            formableId: res.body.data.invoices[0].id,
            formableType: 'PurchaseInvoice',
          }
        });
        expect(formInvoice.done).toEqual(1);

        const formDownPayment = await tenantDatabase.Form.findOne({
          where: {
            formableId: res.body.data.downPayments[0].id,
            formableType: 'PurchaseDownPayment',
          }
        });
        expect(formDownPayment.done).toEqual(1);

        const formReturn = await tenantDatabase.Form.findOne({
          where: {
            formableId: res.body.data.returns[0].id,
            formableType: 'PurchaseReturn',
          }
        });
        expect(formReturn.done).toEqual(1);

        request(app)
          .post('/v1/purchase/payment-order/reject')
          .set('Tenant', 'test_dev')
          .set('Content-Type', 'application/json')
          .send(createFormRejectDto)
          .expect('Content-Type', /json/)
          .expect(async () => {
            await formInvoice.reload();
            await formDownPayment.reload();
            await formInvoice.reload();

            expect(formInvoice.done).toEqual(0);
            expect(formDownPayment.done).toEqual(0);
            expect(formReturn.done).toEqual(0);
          })
          .end(done);
      })
      .end(done);
  });
});

async function generateEmailApprovalToken(paymentOrder, approver) {
  const payload = {
    paymentOrderId: paymentOrder.id,
    userId: approver.id,
  };
  const expires = moment().add(7, 'days');

  const token = await tokenService.generatePayloadToken(payload, expires);

  return token;
}

const generateRecordFactories = async ({
  maker,
  approver,
  branch,
  branchUser,
  warehouse,
  supplier,
  item,
  itemUnit,
  allocation,
  purchaseInvoice,
  formPurchaseInvoice,
  purchaseDownPayment,
  formPurchaseDownPayment,
  purchaseReturn,
  formPurchaseReturn,
} = {}) => {
  const chartOfAccountType = await tenantDatabase.ChartOfAccountType.create({
    name: 'account payable',
    alias: 'hutang usaha',
    isDebit: false,
  });
  const chartOfAccount = await tenantDatabase.ChartOfAccount.create({
    typeId: chartOfAccountType.id,
    position: '',
    name: 'account payable',
    alias: 'hutang dagang',
  });
  const settingJournal = await tenantDatabase.SettingJournal.create({
    feature: 'purchase',
    name: 'account payable',
    description: 'account payable',
    chartOfAccountId: chartOfAccount.id,
  });
  await tenantDatabase.SettingJournal.create({
    feature: 'purchase',
    name: 'down payment',
    description: 'down payment',
    chartOfAccountId: chartOfAccount.id,
  });
  const chartOfAccountTypeExpense = await tenantDatabase.ChartOfAccountType.create({
    name: 'direct expense',
    alias: 'beban operasional',
    isDebit: true,
  });
  const chartOfAccountExpense = await tenantDatabase.ChartOfAccount.create({
    typeId: chartOfAccountTypeExpense.id,
    position: '',
    name: 'other expense',
    alias: 'beban lain-lain',
  });
  const chartOfAccountTypeIncome = await tenantDatabase.ChartOfAccountType.create({
    name: 'other income',
    alias: 'pendapatan lain-lain',
    isDebit: false,
  });
  const chartOfAccountIncome = await tenantDatabase.ChartOfAccount.create({
    typeId: chartOfAccountTypeIncome.id,
    position: '',
    name: 'other income',
    alias: 'pendapatan lain-lain',
  });
  maker = maker || (await factory.user.create());
  approver = approver || (await factory.user.create());
  branch = branch || (await factory.branch.create());
  await factory.permission.create('purchase payment order', maker);
  await factory.permission.create('purchase payment order', approver);
  // create relation between maker and branch for authorization
  branchUser = branchUser || (await factory.branchUser.create({ user: maker, branch, isDefault: true }));
  warehouse = await factory.warehouse.create({ branch, ...warehouse });
  supplier = supplier || (await factory.supplier.create({ branch }));
  // create relation between maker and warehouse for authorization
  item = item || (await factory.item.create());
  itemUnit = itemUnit || (await factory.itemUnit.create({ item, createdBy: maker.id }));
  allocation = allocation || (await factory.allocation.create({ branch }));
  purchaseInvoice = purchaseInvoice || (await factory.purchaseInvoice.create({ supplier }));
  formPurchaseInvoice =
  formPurchaseInvoice ||
    (await factory.form.create({
      branch,
      number: 'PI2211001',
      formable: purchaseInvoice,
      formableType: 'PurchaseInvoice',
      createdBy: maker.id,
      updatedBy: maker.id,
      requestApprovalTo: approver.id,
      approvalStatus: 1,
    }));
  purchaseDownPayment = purchaseDownPayment || (await factory.purchaseDownPayment.create({ supplier }));
  formPurchaseDownPayment =
  formPurchaseDownPayment ||
    (await factory.form.create({
      branch,
      number: 'PDP2211001',
      formable: purchaseDownPayment,
      formableType: 'PurchaseDownPayment',
      createdBy: maker.id,
      updatedBy: maker.id,
      requestApprovalTo: approver.id,
      approvalStatus: 1,
    }));
  purchaseReturn = purchaseReturn || (await factory.purchaseReturn.create({ supplier, purchaseInvoice, warehouse }));
  formPurchaseReturn =
  formPurchaseReturn ||
    (await factory.form.create({
      branch,
      number: 'PR2211001',
      formable: purchaseReturn,
      formableType: 'PurchaseReturn',
      createdBy: maker.id,
      updatedBy: maker.id,
      requestApprovalTo: approver.id,
      approvalStatus: 1,
    }));
  return {
    maker,
    approver,
    branch,
    branchUser,
    warehouse,
    supplier,
    item,
    itemUnit,
    allocation,
    purchaseInvoice,
    formPurchaseInvoice,
    purchaseDownPayment,
    formPurchaseDownPayment,
    purchaseReturn,
    formPurchaseReturn,
    chartOfAccountExpense,
    chartOfAccountIncome,
    settingJournal,
  };
};

const generateCreateFormRequestDto = (recordFactories) => {
  const {
    purchaseInvoice,
    purchaseDownPayment,
    purchaseReturn,
    chartOfAccountExpense,
    chartOfAccountIncome,
    approver,
    supplier,
    allocation,
  } = recordFactories;

  return {
    paymentType: 'cash',
    supplierId: supplier.id || 1,
    supplierName: supplier.name || 'Supplier',
    date: new Date('2022-12-03'),
    invoices: [{
      id: purchaseInvoice.id,
      amount: 100000
    }],
    downPayments: [{
      id: purchaseDownPayment.id,
      amount: 20000
    }],
    returns: [{
      id: purchaseReturn.id,
      amount: 10000
    }],
    others: [
      {
        coaId: chartOfAccountExpense.id,
        notes: 'example notes',
        amount: 5000,
        allocationId: allocation.id,
      },
      {
        coaId: chartOfAccountIncome.id,
        notes: 'example notes',
        amount: 10000,
        allocationId: allocation.id,
      },
    ],
    requestApprovalTo: approver.id,
    totalInvoiceAmount: 100000,
    totalDownPaymentAmount: 20000,
    totalReturnAmount: 10000,
    totalOtherAmount: 5000,
    totalAmount: 65000,
    notes: 'example form note',
  }
}