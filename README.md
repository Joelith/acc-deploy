# acc-deploy
NPM module to deploy NodeJS applications to the Oracle Application Container Cloud. This will take care of packaging your application, uploading it to Storage Cloud Service and registering your application. 

# Installation
Install globally with:

	$ npm install -g acc-deploy

You will also need to create a configuration in your home directory. Create '.oracle-acc-config' and add the following:

username=<username>
password=<password>
identity_domain=<identity_domain>
storage_container=<storage container name>
storage_url=<storage REST endpoint>
api_url=<ACC REST endpoint>

# Usage
In the root of your node application, run:

    $ acc-deploy -n "Application Name"

You can also check the status of your application with:

	$ acc-deploy -n "Application Name" -s
