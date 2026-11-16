import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { signToken } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { AppError, conflict, unauthorized } from '../utils/errors.js';

const BCRYPT_ROUNDS = 12;
// Pre-computed hash used to keep login timing similar for unknown emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', BCRYPT_ROUNDS);

const publicUser = (u: { _id: unknown; name: string; email: string; createdAt?: Date }) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  createdAt: u.createdAt,
});

export async function register(req: Request, res: Response) {
  const { name, email, password } = req.body as { name: string; email: string; password: string };
  if (await User.exists({ email })) throw conflict('An account with this email already exists');
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.create({ name, email, passwordHash });
  res.status(201).json({ token: signToken(user._id.toString(), user.tokenVersion ?? 0), user: publicUser(user) });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const user = await User.findOne({ email }).select('+passwordHash');
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid email or password');
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: signToken(user._id.toString(), user.tokenVersion ?? 0), user: publicUser(user) });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id).lean();
  if (!user) throw unauthorized();
  res.json({ user: publicUser(user) });
}

export async function updateProfile(req: Request, res: Response) {
  const user = await User.findByIdAndUpdate(req.user!.id, { $set: { name: req.body.name } }, { new: true }).lean();
  res.json({ user: publicUser(user!) });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
  }
  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1; // revoke all other sessions
  await user.save();
  res.json({ token: signToken(user._id.toString(), user.tokenVersion), message: 'Password updated' });
}

/** Revokes every token issued to this user (all devices). */
export async function logout(req: Request, res: Response) {
  await User.updateOne({ _id: req.user!.id }, { $inc: { tokenVersion: 1 } });
  res.json({ message: 'Signed out' });
}
