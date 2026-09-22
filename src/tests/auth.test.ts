import { describe, it, expect, vi } from 'vitest';
import { requireApiKey } from '../middlewares/auth';
import { env } from '../config/env';
import type { Request, Response } from 'express';

function mockRes() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('requireApiKey middleware', () => {
  it('calls next() when the key matches', () => {
    const req = { header: () => env.WORKER_API_KEY } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireApiKey(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the key is wrong', () => {
    const req = { header: () => 'totally-wrong-key' } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects with 401 when the key is missing', () => {
    const req = { header: () => undefined } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requireApiKey(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
