#!/usr/bin/env node
var prompt = require('prompt');
var cfg = require('home-config').load('.oracle-acc-config');
var chalk = require('chalk');
var program = require('commander');
var rest = require('restling');
var restler = require('restler');
var archiver = require('archiver');
var fs = require('fs');

var Promise = require('bluebird');
Promise.promisifyAll(prompt);

var errorMsgs = [];
var attrs = ['username', 'password', 'identity_domain', 'storage_url', 'storage_container'];
for (var i = attrs.length - 1; i >= 0; i--) {
	if (!cfg[attrs[i]]) errorMsgs.push('Must pass ' + attrs[i] + ' in .oracle-acc-config file in your home directory');
}

if (errorMsgs.length > 0) {
	console.error(chalk.red(errorMsgs.join("\n")));
	process.exit(1);
}

var username = cfg['username'];
var identity_domain = cfg['identity_domain'];
var password = cfg['password']
var api_url = cfg['api_url'] ? cfg['api_url'] : 'https://apaas.us.oraclecloud.com';
var storage_url = cfg['storage_url'];
var storage_container = cfg['storage_container'];
var storage_token;

var file_size;

program
	.option('-n, --name <name>', 'The name of the ACC application to upload to')
	.parse(process.argv);

// Zip up the files
// Delete the zipped file if it was left around

var created_zip = new Promise(function(resolve) {
	try {
		fs.unlinkSync(program.name + '.zip');
	} catch (e) {
		// Ignore: The file didn't exist
	}
	var archive = archiver('zip', {});
	archive.on('error', function (err) {
		console.log('error');
		throw err
	});
	archive.directory(process.cwd(), '' , {date: new Date()});
	var output = fs.createWriteStream(program.name + '.zip');	
	archive.pipe(output);
	output.on('close', function (file) {
		file_size = archive.pointer();
		resolve();
	});
	console.log('Creating zip file');
	archive.finalize();
})
.then(function () {
	return new Promise(function (resolve, reject) {
		// Upload to storage cloud service
		// Get token first
		rest.get(storage_url + '/auth/v1.0', {
			headers : {
				'X-Storage-User': 'Storage-' + identity_domain + ':' + username,
				'X-Storage-Pass' : password
			}
		}).then(function (result) {
			storage_token = result.response.headers['x-auth-token'];
			console.log('Successfully connected to storage cloud service');
			resolve(storage_token);
		}, function (error) {
			console.error(chalk.red('Unable to authenticate with storage cloud. Check your configuration details'));
			console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));

			reject(error);
		});
	})
})
.then(function () {
	// Now check if the container is available
	return new Promise(function(resolve, reject) {
		rest.head(storage_url + '/v1/Storage-' + identity_domain + '/' + storage_container, {
			headers : {
				'X-AUTH-TOKEN' : storage_token
			}
		}).then(function (result) {
			// Storage container exists
			resolve();
		}, function (error) {
			if (error.statusCode == 404) {
				// Storage container doesn't exist. Do they want us to create it for them?
				console.log('Storage Container \'' + storage_container + '\' not found');
				prompt.confirmAsync('Create?: [no]').then(function (response) {
					if (!response) {
						// They don't want us to create one. Exit, as we don't have a container to upload to
						process.exit(1);
					} else {
						// Create a container
						rest.put(storage_url + '/v1/Storage-' + identity_domain + '/' + storage_container, {
							headers : {
								'X-AUTH-TOKEN' : storage_token
							}
						}).then(function (result) {
							resolve();
						},function(error) {
							console.error(chalk.red('Unable to create storage container on storage cloud.'));
							console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));
							reject(error);
						})
					}
				});
			} else {
				console.error(chalk.red('Unable to connect to storage container on storage cloud.'));
				console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));
				reject(error);
			}
		});
	});
})
.then(function () {
	// Upload the server.zip file to the storage cloud container
	return new Promise(function(resolve, reject) {
		rest.put(storage_url + '/v1/Storage-' + identity_domain + '/' + storage_container + '/' + program.name + '.zip', {
			headers:{
				'X-AUTH-TOKEN' : storage_token
			},
			data: fs.readFileSync(program.name + '.zip')
		}).then(function (result) {
			console.log('Successfully upload package to storage cloud service');
			resolve();
		}, function (error) {
			console.error(chalk.red('uploade package failed!'));
			console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));
			reject(error);
		});
	});
})
.then(function () {
	// Check if the application exists
	return new Promise(function(resolve, reject) {
		console.log('Checking application exists - ' + api_url + '/paas/service/apaas/api/v1.1/apps/' + identity_domain + '/' + program.name);
		rest.get(api_url + '/paas/service/apaas/api/v1.1/apps/' + identity_domain + '/' + program.name, {
			username : username,
			password : password,
			headers  : {
				'X-ID-TENANT-NAME' : identity_domain
			}
		}).then(function (result) {
//			console.log(result);
			prompt.confirmAsync('Update?: [no]').then(function (response) {
				if (!response) {
					// They don't want us to update one. Exit.
					process.exit(1);
				} else {
					// Update the application
					console.log('Updating the application');
					var data_for_update = {
						'archiveURL': storage_container + '/' + program.name + '.zip',
						'note':'update application ' + program.name
					};
					if(cfg['manifest_path']){
						data_for_update.manifest = restler.file(cfg['manifest_path'], null, fs.statSync(cfg['manifest_path'])['size'], null, 'application/json');
					}
					if(cfg['deployment_path']){
						data_for_update.deployment = restler.file(cfg['deployment_path'], null, fs.statSync(cfg['deployment_path'])['size'], null, 'application/json');
					}
					
					rest.put(api_url + '/paas/service/apaas/api/v1.1/apps/' + identity_domain + '/' + program.name, {
						username : username,
						password : password,
						headers : {
							'X-ID-TENANT-NAME' : identity_domain
						},
						multipart : true,
						data: data_for_update
					}).then(function (result) {
						console.log('Successfully update application');
						resolve();
					},function(error) {
						console.error(chalk.red('Update application failed'));
						console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));
						reject(error);
					});
				}
			});
		}, function (error) {
			if (error.statusCode == 404) {
			// The application does not exist. Ask if they want us to create it for them
				console.log('Application does not exist.');
				prompt.confirmAsync('Create?: [no]').then(function (response){
					if (!response) {
						process.exit(1);
						return;
					}
				// Create the application
				console.log('Creating the application');
				var data_for_create = {
						'name': program.name,
						'runtime': 'node',
						'subscription' : cfg['subscription'] ? cfg['subscription'] : 'hourly',
						'archiveURL': storage_container + '/' + program.name + '.zip',
						'note':'create application ' + program.name
					};
					if(cfg['manifest_path']){
						data_for_create.manifest = restler.file(cfg['manifest_path'], null, fs.statSync(cfg['manifest_path'])['size'], null, 'application/json');
					}
					if(cfg['deployment_path']){
						data_for_create.deployment = restler.file(cfg['deployment_path'], null, fs.statSync(cfg['deployment_path'])['size'], null, 'application/json');
					}
					
					rest.post(api_url + '/paas/service/apaas/api/v1.1/apps/' + identity_domain , {
						username : username,
						password : password,
						headers : {
							'X-ID-TENANT-NAME' : identity_domain
						},
						multipart : true,
						data: data_for_create
					}).then(function (result) {
						console.log('Successfully create application');
						console.log('Please wait for several minutes before you could access Application ' + program.name + ' . The web url is ' + result.data.webURL);
						resolve();
					},function(error) {
						console.error(chalk.red('Create application failed'));
						console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));
						reject(error);
					});
				});		
			}else {
				console.error(chalk.red('Unable to get application from the cloud. Check name and connection details'));
				console.error(chalk.red('Message: ' + error + '. Status Code: ' + error.statusCode));
				reject(error);
			}
		});
	});
}).catch(function (error) {
	console.log('Catch all error', error);
	process.exit(1);
});