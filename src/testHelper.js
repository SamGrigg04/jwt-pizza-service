const request = require('supertest');
const app = require('./service');
const { Role, DB } = require('./database/database.js');

// Lots of test files need this code so we're putting it all in one place

// generates a random name
function randomName() {
  return Math.random().toString(36).substring(2, 12);
}

// needed for routes using authenticateToken
function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

function expectValidJwt(potentialJwt) {
  expect(potentialJwt).toMatch(/^[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*\.[a-zA-Z0-9\-_]*$/);
}

// Admins can't be registered through the API, so insert one directly and then log in.
async function createAdminUser() {
  const password = 'toomanysecrets';
  const user = await DB.addUser({ name: randomName(), email: `${randomName()}@admin.com`, password, roles: [{ role: Role.Admin }] });
  const loginRes = await request(app).put('/api/auth').send({ email: user.email, password });
  return { user: { ...user, password }, token: loginRes.body.token };
}

// registers a diner and returns the user and the token
async function registerDiner() {
  const user = { name: randomName(), email: `${randomName()}@diner.com`, password: 'diner' };
  const registerRes = await request(app).post('/api/auth').send(user);
  return { user: { ...registerRes.body.user, password: user.password }, token: registerRes.body.token };
}

module.exports = { randomName, authHeader, expectValidJwt, createAdminUser, registerDiner };
