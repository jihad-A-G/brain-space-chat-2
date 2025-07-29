import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { Op } from 'sequelize';

dotenv.config();

export async function getUsers(req: Request, res: Response) {
  // @ts-ignore
  const currentUserId = req.user.id;
  // @ts-ignore
  const { User } = req.tenant.models;
  const users = await User.findAll({
    where: {
      id: { [Op.ne]: currentUserId }
    }
  });
  res.json(users);
}

export async function getJwt(req: Request, res: Response) {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }
  try {
    // @ts-ignore
    const { User } = req.tenant.models;
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
      { expiresIn: '7d' }
    );
    
    res.json({ token });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ message: 'Error issuing JWT', error: errorMessage });
  }
}

// Update user's allow_notification field
export async function updateAllowNotification(req: Request, res: Response) {
  const { userId, allow_notification } = req.body;
  if (typeof allow_notification !== 'boolean') {
    return res.status(400).json({ error: 'allow_notification must be boolean' });
  }
  try {
    // @ts-ignore
    const { User } = req.tenant.models;
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.allow_notification = allow_notification;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ message: 'Error updating notification setting', error: errorMessage });
  }
}