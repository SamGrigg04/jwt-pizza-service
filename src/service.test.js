const request = require('supertest');
const app = require('./service');

// calls get and checks the message
test('welcome', async () => {
  const res = await request(app).get('/');
  expect(res.status).toBe(200);
  expect(res.body.message).toBe('welcome to JWT Pizza');
  expect(res.body.version).toBeDefined();
});

// make sure the array has an object with at least these fields
test('docs', async () => {
  const res = await request(app).get('/api/docs');
  expect(res.status).toBe(200);
  expect(res.body.endpoints).toEqual(expect.arrayContaining([expect.objectContaining({ method: 'POST', path: '/api/auth' })]));
  expect(res.body.config.factory).toBeDefined();
});

// should return a 404 when you run any unrecognized endpoint
test('unknown endpoint', async () => {
  const res = await request(app).get('/api/nope');
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown endpoint');
});
