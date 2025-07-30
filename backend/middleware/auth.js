// middleware/auth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH;

if (!JWT_SECRET || !ADMIN_PASSWORD_HASH) {
  console.error('Missing required environment variables: JWT_SECRET and/or ADMIN_PASSWORD_HASH');
  process.exit(1);
}

// Middleware to verify JWT token for admin-only routes
export const verifyAdminToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No valid token provided.' });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Middleware to check if user is admin (optional - for routes that behave differently for admins)
export const checkAdminStatus = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.isAdmin = false;
    return next();
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.isAdmin = decoded.isAdmin || false;
    req.user = decoded;
  } catch (error) {
    req.isAdmin = false;
  }
  
  next();
};

// Utility function to verify admin password
export const verifyAdminPassword = async (password) => {
  try {
    return await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  } catch (error) {
    console.error('Error verifying admin password:', error);
    return false;
  }
};

// Utility function to generate JWT token
export const generateAdminToken = () => {
  return jwt.sign(
    { isAdmin: true },
    JWT_SECRET,
    { expiresIn: '7d' } // Token expires in 7 days
  );
};