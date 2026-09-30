const request = require('supertest');
const app = require('../service');
const { randomName, authHeader, createAdminUser, registerDiner } = require('../testHelper');

let admin;
let franchisee;
let otherDiner;
let franchise;

// make some guys for future use
beforeAll(async () => {
  admin = await createAdminUser();
  franchisee = await registerDiner();
  otherDiner = await registerDiner();
  franchise = await createFranchise(franchisee.user.email);
});

// clean up when you're done
afterAll(async () => {
  await request(app).delete(`/api/franchise/${franchise.id}`).set(authHeader(admin.token));
});

// register a regular diner and have an admin set them as a franchise by creating a franchise
// with that diner's email as the franchise email so they link up
async function createFranchise(adminEmail) {
  const res = await request(app).post('/api/franchise').set(authHeader(admin.token)).send({ name: randomName(), admins: [{ email: adminEmail }] });
  expect(res.status).toBe(200);
  return res.body;
}

function createStore(token) {
  return request(app).post(`/api/franchise/${franchise.id}/store`).set(authHeader(token)).send({ name: randomName() });
}

function deleteStore(token, storeId) {
  return request(app).delete(`/api/franchise/${franchise.id}/store/${storeId}`).set(authHeader(token));
}

test('admin can create and delete a franchise', async () => {
  const created = await createFranchise(franchisee.user.email);
  expect(created).toMatchObject({ id: expect.any(Number), admins: [{ id: franchisee.user.id, name: franchisee.user.name, email: franchisee.user.email }] });

  const deleteRes = await request(app).delete(`/api/franchise/${created.id}`).set(authHeader(admin.token));
  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body.message).toBe('franchise deleted');

  const listRes = await request(app).get(`/api/franchise?name=${created.name}`);
  expect(listRes.body.franchises).toEqual([]);
});

test('diner cannot create a franchise', async () => {
  const res = await request(app).post('/api/franchise').set(authHeader(otherDiner.token)).send({ name: randomName(), admins: [{ email: otherDiner.user.email }] });
  expect(res.status).toBe(403);
});

// diner shouldn't be able to delete one either but they can

test('create franchise with an unknown admin', async () => {
  const res = await request(app).post('/api/franchise').set(authHeader(admin.token)).send({ name: randomName(), admins: [{ email: `${randomName()}@nobody.com` }] });
  expect(res.status).toBe(404);
});

test('list franchises', async () => {
  const res = await request(app).get(`/api/franchise?name=${franchise.name}`);
  expect(res.status).toBe(200);
  expect(res.body.more).toBe(false);
  expect(res.body.franchises).toEqual([expect.objectContaining({ id: franchise.id, name: franchise.name, stores: expect.any(Array) })]);
  expect(res.body.franchises[0].admins).toBeUndefined();
});

test('admin sees franchise admins when listing', async () => {
  const res = await request(app).get(`/api/franchise?name=${franchise.name}`).set(authHeader(admin.token));
  expect(res.status).toBe(200);
  expect(res.body.franchises[0].admins).toEqual([{ id: franchisee.user.id, name: franchisee.user.name, email: franchisee.user.email }]);
});

test('franchisee can list their franchises', async () => {
  const res = await request(app).get(`/api/franchise/${franchisee.user.id}`).set(authHeader(franchisee.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual([expect.objectContaining({ id: franchise.id, name: franchise.name })]);
});

test('admin can list any user franchises', async () => {
  const res = await request(app).get(`/api/franchise/${franchisee.user.id}`).set(authHeader(admin.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual([expect.objectContaining({ id: franchise.id })]);
});

test("diner cannot list another user's franchises", async () => {
  const res = await request(app).get(`/api/franchise/${franchisee.user.id}`).set(authHeader(otherDiner.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('user with no franchises', async () => {
  const res = await request(app).get(`/api/franchise/${otherDiner.user.id}`).set(authHeader(otherDiner.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual([]);
});

test('franchisee can create and delete a store', async () => {
  const createRes = await createStore(franchisee.token);
  expect(createRes.status).toBe(200);
  expect(createRes.body).toMatchObject({ id: expect.any(Number), franchiseId: franchise.id, name: expect.any(String) });

  const deleteRes = await deleteStore(franchisee.token, createRes.body.id);
  expect(deleteRes.status).toBe(200);
  expect(deleteRes.body.message).toBe('store deleted');
});

test('admin can create and delete a store', async () => {
  const createRes = await createStore(admin.token);
  expect(createRes.status).toBe(200);

  const deleteRes = await deleteStore(admin.token, createRes.body.id);
  expect(deleteRes.status).toBe(200);
});

test('other users cannot create or delete stores', async () => {
  const createRes = await createStore(otherDiner.token);
  expect(createRes.status).toBe(403);

  const { body: store } = await createStore(franchisee.token);
  const deleteRes = await deleteStore(otherDiner.token, store.id);
  expect(deleteRes.status).toBe(403);
});
