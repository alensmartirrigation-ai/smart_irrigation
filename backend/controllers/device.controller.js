const { Device, Farm, FarmDevice, DeviceIrrigationStatus } = require('../models');
const deviceService = require('../services/device.service');
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
      location,
      moisture_threshold: req.body.moisture_threshold || 30
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

    include.push({
      model: DeviceIrrigationStatus
    });

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
      location,
      moisture_threshold: req.body.moisture_threshold !== undefined ? req.body.moisture_threshold : device.moisture_threshold
    });

    res.status(200).json({ status: 'success', data: device });
  } catch (error) {
    logger.error(`Failed to update device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const getDeviceReadings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { duration } = req.query; // e.g. '1h', '24h'

    const readings = await deviceService.getReadings(id, duration);
    res.status(200).json({ status: 'success', data: readings });
  } catch (error) {
    logger.error(`Failed to get readings for device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const getDeviceIrrigation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { duration } = req.query;

    const irrigationData = await deviceService.getIrrigationData(id, duration);
    res.status(200).json({ status: 'success', data: irrigationData });
  } catch (error) {
    logger.error(`Failed to get irrigation data for device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const getDeviceIrrigationEvents = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { duration } = req.query;
    
    // Import directly from irrigationService
    const irrigationService = require('../services/irrigationService');
    const events = await irrigationService.getDeviceIrrigationEvents(id, duration || '7d');
    
    res.status(200).json({ status: 'success', data: events });
  } catch (error) {
    logger.error(`Failed to get irrigation events for device ${req.params.id}`, { error: error.message });
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

const startIrrigation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { duration } = req.body;

    if (!duration) {
      return res.status(400).json({ error: 'Duration is required' });
    }

    const result = await deviceService.startIrrigation(id, duration);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Failed to start irrigation for device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const stopIrrigation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await deviceService.stopIrrigation(id);
    res.status(200).json(result);
  } catch (error) {
    logger.error(`Failed to stop irrigation for device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

const updateThreshold = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { moisture_threshold } = req.body;

    if (moisture_threshold === undefined) {
      return res.status(400).json({ error: 'moisture_threshold is required' });
    }

    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    await device.update({ moisture_threshold });
    res.status(200).json({ status: 'success', data: device });
  } catch (error) {
    logger.error(`Failed to update threshold for device ${req.params.id}`, { error: error.message });
    next(error);
  }
};

module.exports = {
  createDevice,
  getAllDevices,
  getDeviceById,
  updateDevice,
  deleteDevice,
  getDeviceReadings,
  getDeviceIrrigation,
  getDeviceIrrigationEvents,
  startIrrigation,
  stopIrrigation,
  updateThreshold
};
