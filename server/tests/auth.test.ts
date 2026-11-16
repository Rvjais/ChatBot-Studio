import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { User } from '../src/models/User.js';
import { auth, clearDatabase, registerUser, startContext, type TestContext } from './helpers/context.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await startContext();
});
afterAll(async () => ctx.stop());
beforeEach(clearDatabase);

describe('authentication', () => {
  it('registers, hashes the password and returns a working JWT', async () => {
    const res = await ctx.api.post('/api/auth/register').send({ name: 'Ada', email: 'Ada@Example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const stored = await User.findOne({ email: 'ada@example.com' }).select('+passwordHash').lean();
    expect(stored!.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored!.passwordHash).not.toContain('password123');

    const me = await ctx.api.get('/api/auth/me').set(auth(res.body.token));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ada@example.com');
  });

  it('rejects duplicate emails, weak passwords and invalid emails', async () => {
    await ctx.api.post('/api/auth/register').send({ name: 'A', email: 'a@example.com', password: 'password123' });
    expect((await ctx.api.post('/api/auth/register').send({ name: 'B', email: 'a@example.com', password: 'password123' })).status).toBe(409);
    expect((await ctx.api.post('/api/auth/register').send({ name: 'B', email: 'b@example.com', password: 'short' })).status).toBe(400);
    expect((await ctx.api.post('/api/auth/register').send({ name: 'B', email: 'not-an-email', password: 'password123' })).status).toBe(400);
  });

  it('logs in with correct credentials only', async () => {
    const { email } = await registerUser(ctx.api);
    const ok = await ctx.api.post('/api/auth/login').send({ email, password: 'password123' });
    expect(ok.status).toBe(200);
    expect(ok.body.token).toEqual(expect.any(String));
    const bad = await ctx.api.post('/api/auth/login').send({ email, password: 'wrong-password1' });
    expect(bad.status).toBe(401);
    const unknown = await ctx.api.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'password123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message); // no user enumeration
  });

  it('protects dashboard routes and rejects forged or malformed tokens', async () => {
    expect((await ctx.api.get('/api/chatbots')).status).toBe(401);
    expect((await ctx.api.get('/api/chatbots').set('Authorization', 'Bearer not.a.jwt')).status).toBe(401);
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NiIsInZlciI6MH0.c2lnbmF0dXJl';
    expect((await ctx.api.get('/api/chatbots').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  it('logout revokes existing tokens', async () => {
    const { token } = await registerUser(ctx.api);
    expect((await ctx.api.get('/api/auth/me').set(auth(token))).status).toBe(200);
    expect((await ctx.api.post('/api/auth/logout').set(auth(token))).status).toBe(200);
    expect((await ctx.api.get('/api/auth/me').set(auth(token))).status).toBe(401);
  });

  it('changing the password revokes old sessions and returns a new token', async () => {
    const { token, email } = await registerUser(ctx.api);
    const res = await ctx.api.put('/api/auth/password').set(auth(token)).send({ currentPassword: 'password123', newPassword: 'newpassword456' });
    expect(res.status).toBe(200);
    expect((await ctx.api.get('/api/auth/me').set(auth(token))).status).toBe(401);
    expect((await ctx.api.get('/api/auth/me').set(auth(res.body.token))).status).toBe(200);
    expect((await ctx.api.post('/api/auth/login').send({ email, password: 'newpassword456' })).status).toBe(200);
  });

  it('strips MongoDB operators from request bodies (NoSQL injection)', async () => {
    const { email } = await registerUser(ctx.api);
    const res = await ctx.api.post('/api/auth/login').send({ email: { $gt: '' }, password: { $ne: null } });
    expect(res.status).toBe(400);
    const res2 = await ctx.api.post('/api/auth/login').send({ email, password: { $ne: 'x' } });
    expect(res2.status).toBe(400);
  });
});
