import { exec } from "node:child_process";
import { sync } from "node:file-exists";

let Service;
let Characteristic;

export default (homebridge) => {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-script", "Script", scriptAccessory);
};

function puts(error, stdout, stderr) {
	console.log(stdout);
	if (stderr) {
		console.error("stderr: ", stderr);
	}
	if (error) {
		console.error("error: ", error);
	}
}

function scriptAccessory(log, config) {
	this.log = log;
	this.service = "LockMechanism";

	this.name = config.name;
	this.onCommand = config.on;
	this.offCommand = config.off;
	this.stateCommand = config.state;
	this.onValue = config.on_value;
	this.fileState = config.fileState || false;
	this.onValue = this.onValue.trim().toLowerCase();
	//this.exactMatch = config['exact_match'] || true;
}

/* 
  scriptAccessory.prototype.matchesString = function(match) {
  if(this.exactMatch) {
    return (match === this.onValue);
  }
  else {
    return (match.indexOf(this.onValue) > -1);
  }
}
*/
scriptAccessory.prototype.setState = function (lockState, callback) {
	const targetState =
		lockState === Characteristic.LockTargetState.UNSECURED
			? "UNSECURED"
			: "SECURED";
	const command =
		lockState === Characteristic.LockTargetState.UNSECURED
			? this.onCommand
			: this.offCommand;

	if (!command) {
		this.log.warn(`No command defined for ${targetState} state.`);
		const currentLockStateVal = this.serviceInstance.getCharacteristic(
			Characteristic.LockCurrentState,
		).value;
		if (lockState === currentLockStateVal) {
			this.log(`State is already ${targetState}.`);
			callback(null);
			return;
		}
		callback(new Error(`No command defined for ${targetState}`));
		return;
	}

	exec(command, (error, stdout, stderr) => {
		puts(error, stdout, stderr);
		if (error) {
			this.log.error(
				`Failed to set ${this.name} to ${targetState}: ${error.message}`,
			);
			callback(error);
		} else {
			this.log(`Set ${this.name} to ${targetState}`);
			const newCurrentState =
				lockState === Characteristic.LockTargetState.UNSECURED
					? Characteristic.LockCurrentState.UNSECURED
					: Characteristic.LockCurrentState.SECURED;
			this.serviceInstance.updateCharacteristic(
				Characteristic.LockCurrentState,
				newCurrentState,
			);
			callback(null);
		}
	});
};

scriptAccessory.prototype.getState = function (callback) {
	const command = this.stateCommand;
	const stdout = "none";

	if (this.fileState) {
		const flagFile = sync(this.fileState);
		const currentState = flagFile
			? Characteristic.LockCurrentState.UNSECURED
			: Characteristic.LockCurrentState.SECURED;
		this.log(
			`Current state of ${this.name} (file) is: ${currentState === Characteristic.LockCurrentState.UNSECURED ? "UNSECURED" : "SECURED"}`,
		);
		callback(null, currentState);
	} else {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				this.log.error(`Error getting state: ${error.message}`);
				callback(error);
				return;
			}
			const cleanOut = stdout.trim().toLowerCase();
			const currentState =
				cleanOut === this.onValue
					? Characteristic.LockCurrentState.UNSECURED
					: Characteristic.LockCurrentState.SECURED;
			this.log(
				`State of ${this.name} is: ${currentState === Characteristic.LockCurrentState.UNSECURED ? "UNSECURED" : "SECURED"} (raw: "${cleanOut}")`,
			);
			callback(null, currentState);
		});
	}
};

scriptAccessory.prototype.getServices = function () {
	const informationService = new Service.AccessoryInformation();
	this.serviceInstance = new Service.LockMechanism(this.name);

	informationService
		.setCharacteristic(Characteristic.Manufacturer, "script Manufacturer")
		.setCharacteristic(Characteristic.Model, "script Model")
		.setCharacteristic(Characteristic.SerialNumber, "script Serial Number");

	this.serviceInstance
		.getCharacteristic(Characteristic.LockTargetState)
		.on("set", this.setState.bind(this));

	if (this.stateCommand || this.fileState) {
		this.serviceInstance
			.getCharacteristic(Characteristic.LockCurrentState)
			.on("get", this.getState.bind(this));
	} else {
		this.serviceInstance.setCharacteristic(
			Characteristic.LockCurrentState,
			Characteristic.LockCurrentState.SECURED,
		);
	}

	return [informationService, this.serviceInstance];
};
