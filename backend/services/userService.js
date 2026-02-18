const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../config/default');

const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'users.json');

class UserService {
  constructor() {
    this.data = {
      admin: { name: 'Admin', farmName: 'My Farm', password: 'admin' },
      users: []
    };
    this.loadData();
    this.seedAdmin();
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
        const loadedData = JSON.parse(fileContent);
        
        // Migration: If 'admin' key exists and is separate, map it to users array if not already there
        if (loadedData.admin && !Array.isArray(loadedData.users)) {
             this.data = { users: [] }; // Reset structure
             // We will handle migration in seedAdmin or here. 
             // Let's keep it simple: If structure is old, we adapt it.
        }
        
        // If loaded data has the new structure (just users array or users key), use it
        if (loadedData.users) {
            this.data.users = loadedData.users;
        } 
        
        // Handle legacy: if it had admin object but no users array or separate
        if (loadedData.admin && !this.data.users.find(u => u.role === 'admin')) {
             const legacyAdmin = loadedData.admin;
             this.data.users.push({
                 id: 'admin-legacy',
                 name: legacyAdmin.name || 'Admin',
                 farmName: legacyAdmin.farmName || 'My Farm',
                 role: 'admin',
                 username: 'admin',
                 password: legacyAdmin.password || 'admin',
                 whatsapp: legacyAdmin.whatsapp
             });
        }
      } else {
        this.saveData(); // Create initial file
      }
    } catch (error) {
      logger.error('Failed to load user data', { error: error.message });
      // Initialize if failed
      this.data.users = [];
    }
  }

  seedAdmin() {
      // Check if any admin exists
      const adminExists = this.data.users.some(u => u.role === 'admin');
      if (!adminExists) {
          this.data.users.push({
              id: 'default-admin',
              name: config.admin.name,
              username: config.admin.username,
              password: config.admin.password,
              role: 'admin',
              farmName: config.admin.farmName,
              whatsapp: {
                  jid: '',
                  name: '',
                  connectedAt: null
              },
              createdAt: new Date().toISOString()
          });
          this.saveData();
          logger.info('Default admin user seeded');
      }
  }

  saveData() {
    try {
      // Ensure directory exists
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Save only the users array wrapped in object if we want to keep extensibility, or matches legacy check
      fs.writeFileSync(DATA_FILE, JSON.stringify({ users: this.data.users }, null, 2));
    } catch (error) {
      logger.error('Failed to save user data', { error: error.message });
    }
  }

  saveAdminInfo(name, farmName) {
    const admin = this.getAdminInfo();
    if (admin) {
        admin.name = name;
        admin.farmName = farmName;
        this.saveData();
        return admin;
    }
    return null;
  }

  updateAdminWhatsAppDetails(jid, platformName) {
    const admin = this.getAdminInfo();
    if (admin) {
        admin.whatsapp = {
            jid,
            name: platformName || 'Unknown',
            connectedAt: new Date().toISOString()
        };
        this.saveData();
        logger.info('Admin WhatsApp details updated', { jid });
    }
  }

  getAdminInfo() {
    // Return first admin found
    const admin = this.data.users.find(u => u.role === 'admin');
    if (!admin) return null;
    
    // Return admin info without password
    const { password, ...adminInfo } = admin;
    return adminInfo;
  }

  authenticate(username, password) {
    const user = this.data.users.find(u => u.username === username || u.phone === username); // Allow login by phone too if needed
    
    if (user && user.password === password) {
      const { password, ...userInfo } = user;
      return userInfo;
    }
    return null;
  }

  updatePassword(username, newPassword) {
     const user = this.data.users.find(u => u.username === username);
     if (user) {
         user.password = newPassword;
         this.saveData();
         return true;
     }
     return false;
  }

  addUser(name, phone) {
    if (!name || !phone) {
      throw new Error('Name and phone are required');
    }
    
    // Normalize phone (remove non-digits)
    const normalizedPhone = phone.replace(/\D/g, '');
    
    // Check if user already exists
    const exists = this.data.users.find(u => u.phone === normalizedPhone);
    if (exists) {
        throw new Error('User with this phone number already exists');
    }

    const newUser = {
      id: Date.now().toString(),
      name,
      phone: normalizedPhone,
      role: 'user', // Default role
      username: normalizedPhone, // Use phone as username for regular users by default
      password: normalizedPhone, // Default password is phone number (insecure, but matches 'simple' requirement context)
      createdAt: new Date().toISOString()
    };
    
    this.data.users.push(newUser);
    this.saveData();
    return newUser;
  }

  getUsers() {
    return this.data.users;
  }
}

module.exports = new UserService();
