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

// no token means no list
test('list users unauthorized', async () => {
  const res = await request(app).get('/api/user');
  expect(res.status).toBe(401);
});

// only admins get to see everybody
test('list users requires admin', async () => {
  const res = await request(app).get('/api/user').set(authHeader(diner.token));
  expect(res.status).toBe(403);
});

// admin gets a page of users with their roles (and definitely no passwords)
test('list users', async () => {
  const res = await request(app).get('/api/user').set(authHeader(admin.token));
  expect(res.status).toBe(200);
  expect(res.body).toMatchObject({ users: expect.any(Array), more: expect.any(Boolean) });
  expect(res.body.users.length).toBeGreaterThan(0);
  for (const user of res.body.users) {
    expect(user).toMatchObject({ id: expect.any(Number), name: expect.any(String), email: expect.any(String), roles: expect.any(Array) });
    expect(user.password).toBeUndefined();
  }
});

// random names are basically unique, so filtering by one should find exactly that user
// (and * works as a wildcard, like the franchise filter)
test('list users filtered by name', async () => {
  const { user } = await registerDiner();
  const res = await request(app).get(`/api/user?name=${user.name}`).set(authHeader(admin.token));
  expect(res.status).toBe(200);
  expect(res.body.users).toEqual([{ id: user.id, name: user.name, email: user.email, roles: [{ role: 'diner' }] }]);

  const wildcardRes = await request(app).get(`/api/user?name=${user.name.slice(0, 6)}*`).set(authHeader(admin.token));
  expect(wildcardRes.body.users.map((u) => u.id)).toContain(user.id);
});

// two users share a random prefix, so with limit=1 they should land on separate pages
test('list users paginated', async () => {
  const prefix = randomName();
  const { user: first } = await registerDiner(`${prefix}-1`);
  const { user: second } = await registerDiner(`${prefix}-2`);

  const page0 = await request(app).get(`/api/user?page=0&limit=1&name=${prefix}*`).set(authHeader(admin.token));
  expect(page0.body.users.length).toBe(1);
  expect(page0.body.more).toBe(true);

  const page1 = await request(app).get(`/api/user?page=1&limit=1&name=${prefix}*`).set(authHeader(admin.token));
  expect(page1.body.users.length).toBe(1);
  expect(page1.body.more).toBe(false);

  const ids = [page0.body.users[0].id, page1.body.users[0].id];
  expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
});

// no token means no deleting
// (each delete test registers its own victim so the shared diner never gets deleted)
test('delete user unauthorized', async () => {
  const { user } = await registerDiner();
  const res = await request(app).delete(`/api/user/${user.id}`);
  expect(res.status).toBe(401);
});

// diners can't go around deleting people
test('delete user requires admin', async () => {
  const { user } = await registerDiner();
  const res = await request(app).delete(`/api/user/${user.id}`).set(authHeader(diner.token));
  expect(res.status).toBe(403);
});

// admin deletes a user, and they're really gone: can't log in, old token is dead, not in the list anymore
test('admin can delete a user', async () => {
  const { user, token } = await registerDiner();
  const res = await request(app).delete(`/api/user/${user.id}`).set(authHeader(admin.token));
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ message: 'user deleted' });

  const loginRes = await request(app).put('/api/auth').send({ email: user.email, password: user.password });
  expect(loginRes.status).toBe(404);

  const meRes = await request(app).get('/api/user/me').set(authHeader(token));
  expect(meRes.status).toBe(401);

  const listRes = await request(app).get(`/api/user?name=${user.name}`).set(authHeader(admin.token));
  expect(listRes.body.users).toEqual([]);
});
