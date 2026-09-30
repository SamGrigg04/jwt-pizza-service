const request = require('supertest');
const app = require('../service');
const { randomName, authHeader, expectValidJwt, createAdminUser, registerDiner } = require('../testHelper');

let admin;
let diner;

// makes an admin and a user for testing
beforeAll(async () => {
  admin = await createAdminUser();
  diner = await registerDiner();
});

// gets a user and makes sure they're authenticated
test('get authenticated user', async () => {
  const res = await request(app).get('/api/user/me').set(authHeader(diner.token));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ id: diner.user.id, name: diner.user.name, email: diner.user.email, roles: [{ role: 'diner' }] });
});

// gets an unauthenticated user and makes sure it returns a 401
test('get authenticated user requires auth', async () => {
  const res = await request(app).get('/api/user/me');
  expect(res.status).toBe(401);
});

// change the user info and log in again to make sure it sticks
// (make a new diner becuase other tests assume it has the same info it logged in with)
test('user can update themselves', async () => {
  const { user, token } = await registerDiner();
  const changes = { name: randomName(), email: `${randomName()}@test.com`, password: 'newpassword' };
  const res = await request(app).put(`/api/user/${user.id}`).set(authHeader(token)).send(changes);
  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ id: user.id, name: changes.name, email: changes.email });
  expectValidJwt(res.body.token);

  const loginRes = await request(app).put('/api/auth').send({ email: changes.email, password: changes.password });
  expect(loginRes.status).toBe(200);
});

// throws forbidden if a diner tries to updated a diner
test('diner cannot update another user', async () => {
  const res = await request(app).put(`/api/user/${admin.user.id}`).set(authHeader(diner.token)).send({ name: 'hacked' });
  expect(res.status).toBe(403);
});

// admin updates a user, make sure the update sticks
// (send the email too so that getUser doesn't fail)
test('admin can update another user', async () => {
  const { user } = await registerDiner();
  const name = randomName();
  const res = await request(app).put(`/api/user/${user.id}`).set(authHeader(admin.token)).send({ name, email: user.email });
  expect(res.status).toBe(200);
  expect(res.body.user).toMatchObject({ id: user.id, name, email: user.email });
});

// not implemented yet so kinda just getting some coverage
test('list users', async () => {
  const res = await request(app).get('/api/user').set(authHeader(admin.token));
  expect(res.status).toBe(200);
});

// not implemented yet so kinda just getting some coverage
test('delete user', async () => {
  const res = await request(app).delete(`/api/user/${diner.user.id}`).set(authHeader(admin.token));
  expect(res.status).toBe(200);
});
