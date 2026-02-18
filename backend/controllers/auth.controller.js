const userService = require('../services/userService');
const logger = require('../utils/logger');

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await userService.authenticate(username, password);

    if (!user) {
      logger.warn('Failed login attempt', { username });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // In a real app, generate JWT here. For now, we return a simple mock token or just success.
    // We'll use a simple "session" token which is just a base64 string for now.
    const token = Buffer.from(`${user.username || user.phone}:${Date.now()}`).toString('base64');

    logger.info('Admin logged in successfully', { username });
    res.json({ 
      message: 'Login successful',
      token,
      user
    });
  } catch (error) {
    logger.error('Login error', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.logout = (req, res) => {
  // Client-side token removal is enough for stateless, but we can log it.
  logger.info('Admin logged out');
  res.json({ message: 'Logged out successfully' });
};
