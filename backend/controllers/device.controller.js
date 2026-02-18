const { Device, Farm, FarmDevice } = require('../models');
const logger = require('../utils/logger');

const createDevice = async (req, res, next) => {
  try {
    const { device_name, model, location, farmId } = req.body;

    if (!device_name || !model) {
      return res.status(400).json({ error: 'Missing required fields: device_name, model' });
    }

    const device = await Device.create({
      device_name,
      model,
      location
    });

    if (farmId) {
      const farm = await Farm.findByPk(farmId);
      if (farm) {
        await FarmDevice.create({
          farm_id: farmId,
          device_id: device.id
        });
      } else {
        logger.warn(`Farm ${farmId} not found when creating device ${device.id}`);
      }
    }

    res.status(201).json({ status: 'success', data: device });
  } catch (error) {
    logger.error('Failed to create device', { error: error.message });
    next(error);
  }
};

const getAllDevices = async (req, res, next) => {
  try {
    const { farmId } = req.query;
    const where = {};
    const include = [];

    if (farmId) {
      include.push({
        model: Farm,
        where: { id: farmId },
        through: { attributes: [] } // Hide join table attributes
      });
    } else {
      include.push({
        model: Farm,
        through: { attributes: [] }
      });
    }

    const devices = await Device.findAll({
      where,
      include
    });

    res.status(200).json({ status: 'success', data: devices });
  } catch (error) {
    logger.error('Failed to fetch devices', { error: error.message });
    next(error);
  }
};

const getDeviceById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const device = await Device.findByPk(id, {
      include: [{
        model: Farm,
        through: { attributes: [] }
      }]
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.status(200).json({ status: 'success', data: device });
  } catch (error) {
    logger.error(`Failed to fetch device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const updateDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { device_name, model, location } = req.body;

    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await device.update({
      device_name,
      model,
      location
    });

    res.status(200).json({ status: 'success', data: device });
  } catch (error) {
    logger.error(`Failed to update device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const deleteDevice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const device = await Device.findByPk(id);
    
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await device.destroy();
    res.status(200).json({ status: 'success', message: 'Device deleted' });
  } catch (error) {
    logger.error(`Failed to delete device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

module.exports = {
  createDevice,
  getAllDevices,
  getDeviceById,
  updateDevice,
  deleteDevice
};
