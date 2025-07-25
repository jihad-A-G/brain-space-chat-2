import { Request, Response, NextFunction } from 'express';


export interface AuthRequest extends Request {
  user?: any;
}

const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Skip auth for /api/users/jwt
  if (req.path.includes('/api/users/jwt')) {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  // Use the tenant-aware User model
  const User = req.tenant?.models?.User;
  if (!User) {
    return res.status(500).json({ message: 'Tenant User model not available' });
  }
  try {
    const user = await User.findOne({ where: { token } });
    if (!user) {
      return res.status(401).json({ message: 'Invalid token' });
    }
    req.user = user;
    console.log('req.user.id: ', req.user.id);
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Auth DB error', error: err });
  }
};

export default authMiddleware;