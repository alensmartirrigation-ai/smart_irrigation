const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const DATA_FILE = path.join(process.cwd(), 'src', 'data', 'users.json');

class UserService {
  constructor() {
    this.data = {
      admin: { name: '', farmName: '' },
      users: []
    };
    this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const fileContent = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
      } else {
        this.saveData(); // Create initial file
      }
    } catch (error) {
      logger.error('Failed to load user data', { error: error.message });
    }
  }

  saveData() {
    try {
      // Ensure directory exists
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
    } catch (error) {
      logger.error('Failed to save user data', { error: error.message });
    }
  }

  saveAdminInfo(name, farmName) {
    this.data.admin = { ...this.data.admin, name, farmName };
    this.saveData();
    return this.data.admin;
  }

  updateAdminWhatsAppDetails(jid, platformName) {
    this.data.admin.whatsapp = {
      jid,
      name: platformName || 'Unknown',
      connectedAt: new Date().toISOString()
    };
    this.saveData();
    logger.info('Admin WhatsApp details updated', { jid });
  }

  getAdminInfo() {
    return this.data.admin;
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
