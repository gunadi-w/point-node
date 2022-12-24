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

describe('Payment Order - CreateFormApprove', () => {
  let recordFactories, createFormRequestDto, jwtoken, makerToken
  beforeEach(async (done) => {
    recordFactories = await generateRecordFactories();
    createFormRequestDto = generateCreateFormRequestDto(recordFactories);
    jwtoken = token.generateToken(recordFactories.approver.id);
    makerToken = token.generateToken(recordFactories.maker.id);
    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ makerToken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .end(done);
  });

  it('throw if form already approved', async (done) => {
    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const formPaymentOrder = await paymentOrder.getForm();
    await formPaymentOrder.update({
      approvalStatus: 1,
    });

    request(app)
      .post('/v1/purchase/payment-order/' + paymentOrder.id + '/approve')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `Form already approved`
        })
      })
      .end(done);
  });

  it('throw error when approved by unwanted user', async (done) => {
    const hacker = await factory.user.create();
    const { branch } = recordFactories;
    await factory.branchUser.create({ user: hacker, branch, isDefault: true });
    await factory.permission.create('purchase payment order', hacker);
    jwtoken = token.generateToken(hacker.id);

    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();

    request(app)
      .post('/v1/purchase/payment-order/' + paymentOrder.id + '/approve')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.FORBIDDEN);
        expect(res.body).toMatchObject({
          message: 'Forbidden - You are not the selected approver'
        });
      })
      .end(done);
  });

  it('success approve form', async (done) => {
    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const form = await paymentOrder.getForm();
    const { approver } = recordFactories;

    request(app)
      .post('/v1/purchase/payment-order/' + paymentOrder.id + '/approve')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .expect(async (res) => {
        await form.reload();
        expect(res.status).toEqual(httpStatus.OK);
        expect(res.body.data).toMatchObject({
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
            approvalStatus: 1,
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
          where: { id: res.body.data.form.id }
        });
        expect(paymentOrderForm).toMatchObject({
          approvalStatus: 1,
          approvalAt: expect.any(Date),
          approvalBy: approver.id,
        });

        const activity = await tenantDatabase.UserActivity.findOne({
          where: {
            number: paymentOrderForm.number,
            activity: 'Approved',
          }
        })
        expect(activity).toBeDefined();
      })
      .end(done);
  })

  it('check payment order available to cash out / bank out', async () => {
    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const form = await paymentOrder.getForm();
    const { approver } = recordFactories;

    const invoices = await paymentOrder.getInvoices();
    const downPayments = await paymentOrder.getDownPayments();
    const returns = await paymentOrder.getReturns();
    const others = await paymentOrder.getOthers();

    await request(app)
      .post('/v1/purchase/payment-order/' + paymentOrder.id + '/approve')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .expect(async () => {
        await request(app)
          .get('/v1/purchase/payment-order?filter_form=pending;approvalApproved')
          .set('Authorization', 'Bearer '+ makerToken)
          .set('Tenant', 'test_dev')
          .set('Content-Type', 'application/json')
          .expect('Content-Type', /json/)
          .expect(async (res) => {
            await form.reload();
            expect(res.status).toEqual(httpStatus.OK);
            expect(res.body.data[0]).toMatchObject({
              id: paymentOrder.id,
              paymentType: paymentOrder.paymentType,
              supplierId: paymentOrder.supplierId,
              supplierName: paymentOrder.supplierName,
              amount: paymentOrder.amount,
              invoices: [
                {
                  id: invoices[0].id,
                  purchasePaymentOrderId: paymentOrder.id,
                  amount: invoices[0].amount,
                  referenceableId: invoices[0].referenceableId,
                  referenceableType: invoices[0].referenceableType
                }
              ],
              downPayments: [
                {
                  id: downPayments[0].id,
                  purchasePaymentOrderId: paymentOrder.id,
                  amount: downPayments[0].amount,
                  referenceableId: downPayments[0].referenceableId,
                  referenceableType: downPayments[0].referenceableType
                }
              ],
              returns: [
                {
                  id: returns[0].id,
                  purchasePaymentOrderId: paymentOrder.id,
                  amount: returns[0].amount,
                  referenceableId: returns[0].referenceableId,
                  referenceableType: returns[0].referenceableType
                }
              ],
              others: [
                {
                  id: others[0].id,
                  purchasePaymentOrderId: paymentOrder.id,
                  chartOfAccountId: others[0].chartOfAccountId,
                  allocationId: others[0].allocationId,
                  amount: others[0].amount,
                  notes: others[0].notes
                },
                {
                  id: others[1].id,
                  purchasePaymentOrderId: paymentOrder.id,
                  chartOfAccountId: others[1].chartOfAccountId,
                  allocationId: others[1].allocationId,
                  amount: others[1].amount,
                  notes: others[1].notes
                }
              ],
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
                approvalStatus: 1,
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
          })
      })
  });
})

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