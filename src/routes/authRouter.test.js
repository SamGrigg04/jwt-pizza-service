const request = require('supertest');
const app = require('../service');
const { randomName, authHeader, expectValidJwt, registerDiner } = require('../testHelper');

const testUser = { name: 'pizza diner', email: 'reg@test.com', password: 'a' };
let testUserAuthToken;

// Register a user first so other tests can use it
beforeAll(async () => {
  testUser.email = randomName() + '@test.com';
  const registerRes = await request(app).post('/api/auth').send(testUser);
  testUserAuthToken = registerRes.body.token;
  expectValidJwt(testUserAuthToken);
});

test('login', async () => {
  const loginRes = await request(app).put('/api/auth').send(testUser);
  expect(loginRes.status).toBe(200);
  expectValidJwt(loginRes.body.token);

  const expectedUser = { ...testUser, roles: [{ role: 'diner' }] };
  delete expectedUser.password;
  expect(loginRes.body.user).toMatchObject(expectedUser);
});

// register with no name
test('register requires name, email, and password', async () => {
  const res = await request(app).post('/api/auth').send({ email: testUser.email, password: 'a' });
  expect(res.status).toBe(400);
});

// try to log in with the wrong password
test('login with wrong password', async () => {
  const res = await request(app).put('/api/auth').send({ email: testUser.email, password: 'wrong' });
  expect(res.status).toBe(404);
  expect(res.body.message).toBe('unknown user');
});

// log out then try to use the token
test('logout invalidates the token', async () => {
  const { token } = await registerDiner();
  const logoutRes = await request(app).delete('/api/auth').set(authHeader(token));
  expect(logoutRes.status).toBe(200);
  expect(logoutRes.body.message).toBe('logout successful');

  const meRes = await request(app).get('/api/user/me').set(authHeader(token));
  expect(meRes.status).toBe(401);
});

// gotta be logged in to log out
test('logout requires auth', async () => {
  const res = await request(app).delete('/api/auth');
  expect(res.status).toBe(401);
});
