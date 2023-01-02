const faker = require('faker');
const httpStatus = require('http-status');
const tenantDatabase = require('@src/models').tenant;
const factory = require('@root/tests/utils/factory');
const ProcessSendCreateApproval = require('../../workers/ProcessSendCreateApproval.worker');
const CheckJournal = require('./../CheckJournal');
const request = require('supertest');
const token = require('@src/modules/auth/services/token.service');
const app = require('@src/app');
const moment = require('moment');

jest.mock('@src/modules/auth/services/getToken.service')

jest.mock('../../workers/ProcessSendCreateApproval.worker');
beforeEach(() => {
  ProcessSendCreateApproval.mockClear();
});

describe('Payment Order - CreateFormRequest', () => {
  let recordFactories, createFormRequestDto, jwtoken
  beforeEach(async (done) => {
    recordFactories = await generateRecordFactories();
    createFormRequestDto = generateCreateFormRequestDto(recordFactories);
    jwtoken = token.generateToken(recordFactories.maker.id);
    done();
  });

  it('can\'t create when requested by user that does not have branch default', async (done) => {
    const { branchUser } = recordFactories
    await branchUser.update({
      isDefault: false
    });

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: 'please set default branch to create this form'
        })
      })
      .end(done);
  });

  it('can\'t create when requested by user that does not have access to create', async (done) => {
    await tenantDatabase.RoleHasPermission.destroy({
      where: {},
      truncate: true
    });

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.FORBIDDEN);
        expect(res.body).toMatchObject({
          message: 'Forbidden'
        });
      })
      .end(done);
  });

  describe('throw if required data is empty', () => {
    it('throw on object', async (done) => {
      delete createFormRequestDto['paymentType']
      delete createFormRequestDto['supplierId']
      delete createFormRequestDto['date']
      delete createFormRequestDto['requestApprovalTo']
      delete createFormRequestDto['invoices']
      delete createFormRequestDto['totalInvoiceAmount']
      delete createFormRequestDto['totalDownPaymentAmount']
      delete createFormRequestDto['totalReturnAmount']
      delete createFormRequestDto['totalOtherAmount']
      delete createFormRequestDto['totalAmount']

      request(app)
        .post('/v1/purchase/return')
        .set('Authorization', 'Bearer '+ jwtoken)
        .set('Tenant', 'test_dev')
        .set('Content-Type', 'application/json')
        .send(createFormRequestDto)
        .expect('Content-Type', /json/)
        .expect((res) => {
          expect(res.status).toEqual(httpStatus.BAD_REQUEST);
          expect(res.body).toMatchObject({
            message: 'invalid data',
            meta: expect.arrayContaining([
              `"paymentType" is required`,
              `"supplierId" is required`,
              `"date" is required`,
              `"requestApprovalTo" is required`,
              `"invoices" is required`,
              `"totalInvoiceAmount" is required`,
              `"totalDownPaymentAmount" is required`,
              `"totalReturnAmount" is required`,
              `"totalOtherAmount" is required`,
              `"totalAmount" is required`,
            ])
          })
        })
        .end(done);
    });

    it('throw if invoices amount null', async (done) => {
      delete createFormRequestDto.invoices[0]['amount']

      request(app)
        .post('/v1/purchase/payment-order')
        .set('Authorization', 'Bearer '+ jwtoken)
        .set('Tenant', 'test_dev')
        .set('Content-Type', 'application/json')
        .send(createFormRequestDto)
        .expect('Content-Type', /json/)
        .expect((res) => {
          expect(res.status).toEqual(httpStatus.BAD_REQUEST);
          expect(res.body).toMatchObject({
            message: `"invoices[0].amount" is required`
          })
        })
        .end(done);
    });

    it('throw if invoices amount zero', async (done) => {
      createFormRequestDto.invoices[0].amount = 0

      request(app)
        .post('/v1/purchase/payment-order')
        .set('Authorization', 'Bearer '+ jwtoken)
        .set('Tenant', 'test_dev')
        .set('Content-Type', 'application/json')
        .send(createFormRequestDto)
        .expect('Content-Type', /json/)
        .expect((res) => {
          expect(res.status).toEqual(httpStatus.BAD_REQUEST);
          expect(res.body).toMatchObject({
            message: `"invoices[0].amount" must be greater than or equal to 1`
          })
        })
        .end(done);
    });
  });

  it('throw error if purchase invoice not exist', async (done) => {
    const id = 200;
    createFormRequestDto.invoices[0].id = id;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.NOT_FOUND);
        expect(res.body).toMatchObject({
          message: `purchase invoice with id ${id} not exist`
        })
      })
      .end(done);
  });

  it('throw error if purchase down payment not exist', async (done) => {
    const id = 200;
    createFormRequestDto.downPayments[0].id = id;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.NOT_FOUND);
        expect(res.body).toMatchObject({
          message: `purchase down payment with id ${id} not exist`
        })
      })
      .end(done);
  });

  it('throw error if purchase return not exist', async (done) => {
    const id = 200
    createFormRequestDto.returns[0].id = id;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.NOT_FOUND);
        expect(res.body).toMatchObject({
          message: `purchase return with id ${id} not exist`
        })
      })
      .end(done);
  });

  it('throw error if supplier not exist', async (done) => {
    const id = 200
    createFormRequestDto.supplierId = id;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.NOT_FOUND);
        expect(res.body).toMatchObject({
          message: `supplier not exist`
        })
      })
      .end(done);
  });

  it('throw error if purchase invoice order more than available', async (done) => {
    const { formPurchaseInvoice, purchaseInvoice } = recordFactories;
    const available = await purchaseInvoice.getAvailable();
    const totalBeforeInvoice = createFormRequestDto.totalAmount - createFormRequestDto.totalInvoiceAmount;
    createFormRequestDto.invoices[0].amount = available + 10000;
    createFormRequestDto.totalInvoiceAmount = available + 10000;
    createFormRequestDto.totalAmount = totalBeforeInvoice + available + 10000;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `form ${formPurchaseInvoice.number} order more than available, available ${available} ordered ${createFormRequestDto.invoices[0].amount}`
        })
      })
      .end(done);
  });

  it('throw error if purchase down payment order more than available', async (done) => {
    const { formPurchaseDownPayment, purchaseDownPayment } = recordFactories;
    const available = await purchaseDownPayment.getAvailable();
    const totalBeforeDownPayment = createFormRequestDto.totalAmount + createFormRequestDto.totalDownPaymentAmount;
    createFormRequestDto.downPayments[0].amount = available + 1000;
    createFormRequestDto.totalDownPaymentAmount = available + 1000;
    createFormRequestDto.totalAmount = totalBeforeDownPayment - available + 1000;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `form ${formPurchaseDownPayment.number} order more than available, available ${available} ordered ${createFormRequestDto.downPayments[0].amount}`
        })
      })
      .end(done);
  });

  it('throw error if purchase return order more than available', async (done) => {
    const { formPurchaseReturn, purchaseReturn } = recordFactories;
    const available = await purchaseReturn.getAvailable();
    const totalBeforeReturn = createFormRequestDto.totalAmount + createFormRequestDto.totalReturnAmount;
    createFormRequestDto.returns[0].amount = available + 1000;
    createFormRequestDto.totalReturnAmount = available + 1000;
    createFormRequestDto.totalAmount = totalBeforeReturn + available + 1000;

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `form ${formPurchaseReturn.number} order more than available, available ${available} ordered ${createFormRequestDto.returns[0].amount}`
        })
      })
      .end(done);
  });

  it('throw error if notes more than 255 character', async (done) => {
    createFormRequestDto.notes = faker.datatype.string(300)

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.BAD_REQUEST);
        expect(res.body).toMatchObject({
          message: `"notes" length must be less than or equal to 255 characters long`
        })
      })
      .end(done);
  });

  it('trim notes if have space at start or end', async (done) => {
    createFormRequestDto.notes = ' example notes ';

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.CREATED);
        expect(res.body.data.form).toMatchObject({
          notes: 'example notes',
        })
      })
      .end(done);
  });

  it('throw error on incorrect total invoice', async (done) => {
    const expected = createFormRequestDto.totalInvoiceAmount
    createFormRequestDto.totalInvoiceAmount = expected + 100000

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `incorect total invoice amount, expected ${expected} received ${createFormRequestDto.totalInvoiceAmount}`
        })
      })
      .end(done);
  });

  it('throw error on incorrect total down payment', async (done) => {
    const expected = createFormRequestDto.totalDownPaymentAmount
    createFormRequestDto.totalDownPaymentAmount = expected + 10000

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `incorect total down payment amount, expected ${expected} received ${createFormRequestDto.totalDownPaymentAmount}`
        })
      })
      .end(done);
  });

  it('throw error on incorrect total return', async (done) => {
    const expected = createFormRequestDto.totalReturnAmount
    createFormRequestDto.totalReturnAmount = expected + 10000

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `incorect total return amount, expected ${expected} received ${createFormRequestDto.totalReturnAmount}`
        })
      })
      .end(done);
  });

  it('throw error on incorrect total other', async (done) => {
    const expected = createFormRequestDto.totalOtherAmount
    createFormRequestDto.totalOtherAmount = expected + 10000

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `incorect total other amount, expected ${expected} received ${createFormRequestDto.totalOtherAmount}`
        })
      })
      .end(done);
  });

  it('throw error on incorrect total amount', async (done) => {
    const expected = createFormRequestDto.totalAmount
    createFormRequestDto.totalAmount = expected + 10000

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `incorect total amount, expected ${expected} received ${createFormRequestDto.totalAmount}`
        })
      })
      .end(done);
  });

  it('throw error on total down payment more than total invoice', async (done) => {
    const totalDownPayment = createFormRequestDto.totalDownPayment
    createFormRequestDto.invoices[0].amount = totalDownPayment - 10000
    createFormRequestDto.totalInvoiceAmount = totalDownPayment - 10000

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `total down payment more than total invoice, total down payment: ${totalDownPayment} > total invoice: ${createFormRequestDto.totalInvoiceAmount}`
        })
      })
      .end(done);
  });

  it('throw error on total return more than total invoice', async (done) => {
    const { purchaseReturn } = recordFactories;
    const amount = createFormRequestDto.totalInvoiceAmount + 10000
    await purchaseReturn.update({
      amount,
    });
    createFormRequestDto.returns[0].amount = amount
    createFormRequestDto.totalReturnAmount = amount

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `total return more than total invoice, total return: ${amount} > total invoice: ${createFormRequestDto.totalInvoiceAmount}`
        })
      })
      .end(done);
  });

  it('throw error when setting journal is missing', async (done) => {
    const { settingJournal } = recordFactories;
    await settingJournal.destroy();

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.UNPROCESSABLE_ENTITY);
        expect(res.body).toMatchObject({
          message: `Journal purchase account - account payable not found`
        })
      })
      .end(done);
  });

  it('throw error if form number already in database', async () => {
    const { maker, approver } = recordFactories;
    await request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(res.status).toEqual(httpStatus.CREATED);
      });

    const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne();
    const paymentOrderForm = await paymentOrder.getForm();

    // check if use existing form number it will throw
    await expect(async () => {
      await factory.form.create({
        branch,
        number: paymentOrderForm.number,
        formable: paymentOrder,
        formableType: 'PaymentOrder',
        createdBy: maker.id,
        updatedBy: maker.id,
        requestApprovalTo: approver.id,
      });
    }).rejects.toThrow();
  });

  it('check saved data same with data sent', async () => {
    const { branch, maker, approver } = recordFactories;

    await request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect(async (res) => {
        expect(res.status).toEqual(httpStatus.CREATED);
        expect(res.body.data).toMatchObject({
          id: expect.any(Number),
          paymentType: createFormRequestDto.paymentType,
          supplierId: createFormRequestDto.supplierId,
          supplierName: createFormRequestDto.supplierName,
          amount: createFormRequestDto.totalAmount,
          invoices: [
            {
              id: expect.any(Number),
              purchasePaymentOrderId: res.body.data.id,
              amount: createFormRequestDto.invoices[0].amount,
              referenceableId: createFormRequestDto.invoices[0].id,
              referenceableType: 'PurchaseInvoice'
            }
          ],
          downPayments: [
            {
              id: expect.any(Number),
              purchasePaymentOrderId: res.body.data.id,
              amount: createFormRequestDto.downPayments[0].amount,
              referenceableId: createFormRequestDto.downPayments[0].id,
              referenceableType: 'PurchaseDownPayment'
            }
          ],
          returns: [
            {
              id: expect.any(Number),
              purchasePaymentOrderId: res.body.data.id,
              amount: createFormRequestDto.returns[0].amount,
              referenceableId: createFormRequestDto.returns[0].id,
              referenceableType: 'PurchaseReturn'
            }
          ],
          others: [
            {
              id: expect.any(Number),
              purchasePaymentOrderId: res.body.data.id,
              chartOfAccountId: createFormRequestDto.others[0].coaId,
              allocationId: createFormRequestDto.others[0].allocationId,
              amount: createFormRequestDto.others[0].amount,
              notes: createFormRequestDto.others[0].notes,
            },
            {
              id: expect.any(Number),
              purchasePaymentOrderId: res.body.data.id,
              chartOfAccountId: createFormRequestDto.others[1].coaId,
              allocationId: createFormRequestDto.others[1].allocationId,
              amount: createFormRequestDto.others[1].amount,
              notes: createFormRequestDto.others[1].notes,
            }
          ],
          form: {
            done: false,
            approvalStatus: 0,
            id: expect.any(Number),
            branchId: branch.id,
            date: createFormRequestDto.date.toISOString(),
            number: 'PP' + moment(createFormRequestDto.date).format('YYMM') + '001',
            notes: createFormRequestDto.notes,
            createdBy: maker.id,
            updatedBy: maker.id,
            incrementNumber: 1,
            incrementGroup: 202212,
            formableId: res.body.data.id,
            formableType: 'PurchasePaymentOrder',
            requestApprovalTo: approver.id,
          }
        });

        const paymentOrder = await tenantDatabase.PurchasePaymentOrder.findOne({
          where: { id: res.body.data.id }
        });
        expect(paymentOrder).toMatchObject({
          id: res.body.data.id,
          paymentType: createFormRequestDto.paymentType,
          supplierId: createFormRequestDto.supplierId,
          supplierName: createFormRequestDto.supplierName,
          amount: createFormRequestDto.totalAmount + '.000000000000000000000000000000',
        });

        const paymentOrderForm = await tenantDatabase.Form.findOne({
          where: { id: res.body.data.form.id }
        });
        expect(paymentOrderForm).toMatchObject({
          done: false,
          approvalStatus: 0,
          id: res.body.data.form.id,
          BranchId: branch.id,
          date: createFormRequestDto.date,
          number: 'PP' + moment(createFormRequestDto.date).format('YYMM') + '001',
          notes: createFormRequestDto.notes,
          createdBy: maker.id,
          updatedBy: maker.id,
          incrementNumber: 1,
          incrementGroup: 202212,
          formableId: res.body.data.id,
          formableType: 'PurchasePaymentOrder',
          requestApprovalTo: approver.id,
        });

        const invoice = await tenantDatabase.PurchasePaymentOrderDetails.findOne({
          where: { id: res.body.data.invoices[0].id }
        });
        expect(invoice).toMatchObject({
          id: res.body.data.invoices[0].id,
          purchasePaymentOrderId: res.body.data.id,
          amount: createFormRequestDto.invoices[0].amount + '.000000000000000000000000000000',
          referenceableId: createFormRequestDto.invoices[0].id,
          referenceableType: 'PurchaseInvoice'
        });

        const downPayment = await tenantDatabase.PurchasePaymentOrderDetails.findOne({
          where: { id: res.body.data.downPayments[0].id }
        });
        expect(downPayment).toMatchObject({
          id: res.body.data.downPayments[0].id,
          purchasePaymentOrderId: res.body.data.id,
          amount: createFormRequestDto.downPayments[0].amount + '.000000000000000000000000000000',
          referenceableId: createFormRequestDto.downPayments[0].id,
          referenceableType: 'PurchaseDownPayment'
        });

        const pReturn = await tenantDatabase.PurchasePaymentOrderDetails.findOne({
          where: { id: res.body.data.returns[0].id }
        });
        expect(pReturn).toMatchObject({
          id: res.body.data.returns[0].id,
          purchasePaymentOrderId: res.body.data.id,
          amount: createFormRequestDto.returns[0].amount + '.000000000000000000000000000000',
          referenceableId: createFormRequestDto.returns[0].id,
          referenceableType: 'PurchaseReturn'
        });

        let other = await tenantDatabase.PurchasePaymentOrderDetails.findOne({
          where: { id: res.body.data.others[0].id }
        });
        expect(other).toMatchObject({
          id: res.body.data.others[0].id,
          purchasePaymentOrderId: res.body.data.id,
          chartOfAccountId: createFormRequestDto.others[0].coaId,
          allocationId: createFormRequestDto.others[0].allocationId,
          amount: createFormRequestDto.others[0].amount + '.000000000000000000000000000000',
          notes: createFormRequestDto.others[0].notes,
        });

        other = await tenantDatabase.PurchasePaymentOrderDetails.findOne({
          where: { id: res.body.data.others[1].id }
        });
        expect(other).toMatchObject({
          id: res.body.data.others[1].id,
          purchasePaymentOrderId: res.body.data.id,
          chartOfAccountId: createFormRequestDto.others[1].coaId,
          allocationId: createFormRequestDto.others[1].allocationId,
          amount: createFormRequestDto.others[1].amount + '.000000000000000000000000000000',
          notes: createFormRequestDto.others[1].notes,
        });

        const activity = await tenantDatabase.UserActivity.findOne({
          where: {
            number: paymentOrderForm.number,
            activity: 'Created',
          }
        })
        expect(activity).toBeDefined();
      })

      const { purchaseInvoice, purchaseDownPayment, purchaseReturn } = recordFactories;
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

      await request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect(async (res) => {
        expect(res.status).toEqual(httpStatus.CREATED);
        const paymentOrderForm = await tenantDatabase.Form.findOne({
          where: { id: res.body.data.form.id }
        });
        expect(paymentOrderForm).toMatchObject({
          number: 'PP' + moment(createFormRequestDto.date).format('YYMM') + '002',
        });
      })
  });

  it('check journal balance', async () => {
    const { totalAmount, invoices, downPayments, returns, others } = createFormRequestDto;
    const { isBalance, debit, credit } = await new CheckJournal(tenantDatabase, {
      amount: totalAmount, invoices, downPayments, returns, others
    }).call();

    expect(isBalance).toEqual(true);
    expect(debit).toEqual(credit);
  });

  it('check form reference still pending if amount less than available', async (done) => {
    const { purchaseInvoice, purchaseDownPayment, purchaseReturn } = recordFactories;

    const availableInvoice = await purchaseInvoice.getAvailable();
    expect(availableInvoice).toBeGreaterThan(parseFloat(createFormRequestDto.invoices[0].amount));

    const availableDownPayment = await purchaseDownPayment.getAvailable();
    expect(availableDownPayment).toBeGreaterThan(parseFloat(createFormRequestDto.downPayments[0].amount));

    const availableReturn = await purchaseReturn.getAvailable();
    expect(availableReturn).toBeGreaterThan(parseFloat(createFormRequestDto.returns[0].amount));

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect(async (res) => {
        const formInvoice = await purchaseInvoice.getForm();
        expect(formInvoice.done).toEqual(false);

        const formDownPayment = await purchaseDownPayment.getForm();
        expect(formDownPayment.done).toEqual(false);

        const formReturn = await purchaseReturn.getForm();
        expect(formReturn.done).toEqual(false);
      })
      .end(done);
  });

  it('check form reference done if amount same as available', async (done) => {
    createFormRequestDto.invoices[0].amount = 220000;
    createFormRequestDto.totalInvoiceAmount = 220000;
    createFormRequestDto.downPayments[0].amount = 30000;
    createFormRequestDto.totalDownPaymentAmount = 30000;
    createFormRequestDto.returns[0].amount = 11000;
    createFormRequestDto.totalReturnAmount = 11000;
    createFormRequestDto.totalAmount = 174000;

    const { purchaseInvoice, purchaseDownPayment, purchaseReturn } = recordFactories;

    const availableInvoice = await purchaseInvoice.getAvailable();
    expect(availableInvoice).toEqual(parseFloat(createFormRequestDto.invoices[0].amount));

    const availableDownPayment = await purchaseDownPayment.getAvailable();
    expect(availableDownPayment).toEqual(parseFloat(createFormRequestDto.downPayments[0].amount));

    const availableReturn = await purchaseReturn.getAvailable();
    expect(availableReturn).toEqual(parseFloat(createFormRequestDto.returns[0].amount));

    request(app)
      .post('/v1/purchase/payment-order')
      .set('Authorization', 'Bearer '+ jwtoken)
      .set('Tenant', 'test_dev')
      .set('Content-Type', 'application/json')
      .send(createFormRequestDto)
      .expect('Content-Type', /json/)
      .expect(async (res) => {
        const formInvoice = await purchaseInvoice.getForm();
        expect(formInvoice.done).toEqual(true);

        const formDownPayment = await purchaseDownPayment.getForm();
        expect(formDownPayment.done).toEqual(true);

        const formReturn = await purchaseReturn.getForm();
        expect(formReturn.done).toEqual(true);
      })
      .end(done);
  });

});

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
