import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import supertest from 'supertest';
import { app, db } from '../server.js';

const request = supertest(app);

describe('Spotify Status Backend Tests', () => {

  after(() => {
  });

  it('GET /api/users should return a list of users', async () => {
    const response = await request.get('/api/users');
    
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers['content-type'], 'application/json; charset=utf-8');
    assert.ok(Array.isArray(response.body));
  });

  it('GET /login should redirect to Spotify', async () => {
    const response = await request.get('/login');
    
    assert.strictEqual(response.status, 302);
    assert.ok(response.headers.location.includes('spotify.com'));
  });

  it('GET /api/user/nonexistent should return 404', async () => {
    const response = await request.get('/api/user/notreal-12345/now-playing');
    
    assert.strictEqual(response.status, 404);
  });
});