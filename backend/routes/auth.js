// routes/auth.js
import express from 'express';
import { verifyAdminPassword, generateAdminToken } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Admin login route
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const isValidPassword = await verifyAdminPassword(password);
    
    if (!isValidPassword) {
      // Add a small delay to prevent brute force attacks
      await new Promise(resolve => setTimeout(resolve, 1000));
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = generateAdminToken();
    
    res.json({
      message: 'Login successful',
      token,
      expiresIn: '7d'
    });
  } catch (error) {
    console.error('Error in admin login:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Token verification route (optional - for frontend to check if token is still valid)
router.get('/verify', async (req, res) => {
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
    res.status(401).json({ isValid: false });
  }
});

export default router;