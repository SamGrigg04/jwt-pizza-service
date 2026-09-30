const request = require('supertest');
const app = require('../service');
const { randomName, authHeader, createAdminUser, registerDiner } = require('../testHelper');

let admin;
let diner;
let menuItem;

beforeAll(async () => {
  admin = await createAdminUser();
  diner = await registerDiner();
  menuItem = await addMenuItem({ title: randomName(), description: 'test pizza', image: 'pizza1.png', price: 0.001 });
});

// get rid of stale fake data
afterEach(() => {
  jest.restoreAllMocks();
});

async function addMenuItem(item) {
  const res = await request(app).put('/api/order/menu').set(authHeader(admin.token)).send(item);
  expect(res.status).toBe(200);
  return res.body.find((m) => m.title === item.title);
}

function newOrder() {
  return { franchiseId: 1, storeId: 1, items: [{ menuId: menuItem.id, description: menuItem.title, price: menuItem.price }] };
}

// The factory is an external service, so stub the fetch the order router makes to it.
function mockFactory(ok, body) {
  return jest.spyOn(global, 'fetch').mockResolvedValue({ ok, json: async () => body });
}

test('get menu', async () => {
  const res = await request(app).get('/api/order/menu');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ id: menuItem.id, title: menuItem.title })]));
});

test('admin can add a menu item', async () => {
  const item = { title: randomName(), description: 'another test pizza', image: 'pizza2.png', price: 0.002 };
  const added = await addMenuItem(item);
  expect(added).toMatchObject(item);
});

test('diner cannot add a menu item', async () => {
  const res = await request(app).put('/api/order/menu').set(authHeader(diner.token)).send({ title: randomName(), description: 'nope', image: 'pizza3.png', price: 1 });
  expect(res.status).toBe(403);
});

test('get orders requires auth', async () => {
  const res = await request(app).get('/api/order');
  expect(res.status).toBe(401);
});

// makes an order, checks the response (especially the ending) and confirms it was saved
test('create order', async () => {
  const fetchSpy = mockFactory(true, { reportUrl: 'https://factory.test/report', jwt: 'factory-jwt' });
  const order = newOrder();
  const res = await request(app).post('/api/order').set(authHeader(diner.token)).send(order);
  expect(res.status).toBe(200);
  expect(res.body.order).toMatchObject(order);
  expect(res.body.jwt).toBe('factory-jwt');
  expect(res.body.followLinkToEndChaos).toBe('https://factory.test/report');
  expect(fetchSpy).toHaveBeenCalledWith(expect.stringMatching(/\/api\/order$/), expect.objectContaining({ method: 'POST' }));

  const ordersRes = await request(app).get('/api/order').set(authHeader(diner.token));
  expect(ordersRes.status).toBe(200);
  expect(ordersRes.body.dinerId).toBe(diner.user.id);
  expect(ordersRes.body.orders).toEqual(expect.arrayContaining([expect.objectContaining({ id: res.body.order.id, items: [expect.objectContaining({ menuId: menuItem.id })] })]));
});

// returning false to make sure it fails
test('create order when the factory fails', async () => {
  mockFactory(false, { reportUrl: 'https://factory.test/report' });
  const res = await request(app).post('/api/order').set(authHeader(diner.token)).send(newOrder());
  expect(res.status).toBe(500);
  expect(res.body.message).toBe('Failed to fulfill order at factory');
  expect(res.body.followLinkToEndChaos).toBe('https://factory.test/report');
});

// try to order something not on the menu
test('create order with an unknown menu item', async () => {
  const fetchSpy = mockFactory(true, {});
  const order = { ...newOrder(), items: [{ menuId: -1, description: 'ghost', price: 1 }] };
  const res = await request(app).post('/api/order').set(authHeader(diner.token)).send(order);
  expect(res.status).toBe(500);
  expect(fetchSpy).not.toHaveBeenCalled();
});
