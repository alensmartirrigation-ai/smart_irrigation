const logger = require('../utils/logger');
const { User } = require('../models');

/**
 * Simple authentication middleware
 * In a real application, this would verify a JWT.
 */
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn('Unauthorized access attempt: No token provided');
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  
  if (!token) {
    logger.warn('Unauthorized access attempt: Malformed token');
    return res.status(401).json({ error: 'Unauthorized: Malformed token' });
  }

  try {
    // Decode mock token (username:timestamp)
    const decoded = Buffer.from(token, 'base64').toString();
    const [username] = decoded.split(':');
    
    const user = await User.findOne({ 
      where: { 
        [require('sequelize').Op.or]: [
          { username: username },
          { phone: username }
        ]
      },
      attributes: { exclude: ['password'] },
      include: [{ model: require('../models').Farm }]
    });

    if (!user) {
      logger.warn('Unauthorized access attempt: User not found from token', { username });
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    logger.error('Token verification error', { error: err.message });
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

const authorizeAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    logger.warn('Forbidden access attempt: Not an admin', { userId: req.user?.id });
    res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
};

module.exports = {
  authenticateToken,
  authorizeAdmin
};
