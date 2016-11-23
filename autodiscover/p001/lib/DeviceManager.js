"use strict";

const fs = require('fs');
const crypto = require('crypto');
const Observable = require('events');
const Device = require('./Device');
const SerialPort = require('serialport');
const Mind = require('../');

const DEFAULT_MANUFACTURERS = /(wch)|(arduino)|(1a86)/;
const DEFAULT_BAUDRATE = 115200;

//
// Managers USB connections and disconnections
//
class DeviceManager extends Observable {

	constructor(options) {
		console.debug('new DeviceManager()');
		if (!options ||
			!options.dataPath) {
			throw Error('Error initializing DeviceManager.');
		}
		super();
		options = options || {};
		options.baudRate = options.baudRate || DEFAULT_BAUDRATE;
		options.manufacturers = options.manufacturers || DEFAULT_MANUFACTURERS;
		options.delimiter = options.delimiter || DEFAULT_DELIMITER;
		this.options = options;
		this.devices = options.devices || {};
		// Attach event listeners
		if (options.listeners) {
			for(var event in options.listeners) {
				this.on(event, options.listeners[event]);
			}
		}
		// Start
		this.detectDevices(true);
		setInterval(this.detectDevices.bind(this), 2000);
	}

	// Intialise and keep checking periodically in case we get disconnections
	detectDevices(always) {
		console.debug('DeviceManager.prototype.detectDevices()');
		if (always || (Object.keys(this.devices).length === 0)) {
			this.detect((ports) => {
				this.emit('ready', Object.keys(this.devices).length);
			});
		}
	}

	// Check the USB ports.. Do we have something that looks interesting?
	// If so then connect to it
	detect(callback) {
		console.debug('DeviceManager.prototype.detect()');
		var manufacturers = this.options.manufacturers;
		SerialPort.list((function(err, ports) {
			console.debug('%d USB ports available.', ports.length, ports);
			ports
				.filter((p) => p.manufacturer && !!p.manufacturer.match(manufacturers))
				.map(this.parse.bind(this))
				.filter((p) => p && !this.devices[p.id])
				.forEach(this.connect.bind(this));
			if (callback) callback(ports);
		}).bind(this));
		return this;
	}

	// Generate some port information from what is available
	parse(port) {
		console.debug('DeviceManager.prototype.parse()', port);
		if (!port || !port.comName) return null;
		port = {
			comName: port.comName,
			baudRate: this.options.baudRate,
			session: port.pnpId && port.pnpId.split('\\').pop(),
			pnp: port.pnpId && port.pnpId.split('\\').splice(0,2).join('://') || 'USB://unknown',
		};
		port.id = crypto.createHash('md5').update(port.pnp).digest('base64').substr(0, 2);
		return port;
	}

	// Initialize device connected to port
	connect(port) {
		console.debug('DeviceManager.prototype.connect()', port);
		if (!port) return;
		// Add to list of known devices
		var device = new Device({
			port: port, 
			dataPath: this.options.dataPath,
			delimiter: this.options.delimiter,
			index: Object.keys(this.devices).length
		});
		this.devices[device.id] = device;
		device.on('connected', this.emit.bind(this, 'deviceready', device.id, device.dataPath));
		device.on('disconnect', this.remove.bind(this, device.id));
		device.on('data', this.emit.bind(this, 'data'));
		return this;
	}

	// Controller device no longer needed
	remove(deviceId, reason) {
		console.debug('DeviceManager.prototype.remove()', deviceId, reason);
		var device = this.devices[deviceId];
		if (device) {
			delete this.devices[deviceId];
			this.emit('deviceremoved', deviceId, reason);
			if (Object.keys(this.devices).length === 0) {
				this.emit('offline');
			}
		}
	}
}

if (typeof module !== 'undefined') {
  module.exports = DeviceManager;
}