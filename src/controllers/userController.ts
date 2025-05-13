import { Request, Response } from 'express';
import {User} from '../models/User';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

export async function getUsers(req: Request, res: Response) {
  const users = await User.findAll();
  res.json(users);
}

export async function getJwt(req: Request, res: Response) {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid user' });
    }
    const token = jwt.sign(
      {
        id: user.id,
        name: user.name,
        user_name: user.user_name,
        email: user.email_address,
        role: user.role,
      },
      process.env.JWT_SECRET as string,
      { expiresIn: '2h' }
    );
    res.json({ token });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ message: 'Error issuing JWT', error: errorMessage });
  }
}