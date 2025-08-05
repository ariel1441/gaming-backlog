import express from 'express';
import { verifyAdminPassword, generateAdminToken } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5,                 // Max 5 requests per IP
  message: 'Too many login attempts. Please try again in 5 minutes.',
});

// Admin login route
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      const err = new Error('Password is required');
      err.statusCode = 400;
      return next(err);
    }

    const isValidPassword = await verifyAdminPassword(password);
    
    if (!isValidPassword) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent brute-force
      const err = new Error('Invalid password');
      err.statusCode = 401;
      return next(err);
    }

    const token = generateAdminToken();
    
    res.json({
      message: 'Login successful',
      token,
      expiresIn: '1d'
    });
  } catch (error) {
    next(error); 
  }
});

// Token verification route (optional - for frontend to check if token is still valid)
router.get('/verify', async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ isValid: false });
  }

  const token = authHeader.substring(7);
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.isAdmin) {
      res.json({ isValid: true, isAdmin: true });
    } else {
      res.status(401).json({ isValid: false });
    }
  } catch (error) {
    next(error); 
  }
});

export default router;