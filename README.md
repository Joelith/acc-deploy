# acc-deploy
NPM module for Application Container Cloud Service. This can package up your node application, upload it to the Oracle Storage Cloud Service, and then deploy to the Oracle Application Container Cloud. 

# Usage
Since it's a bad practice to have your credentials in source code, you should load them from default configuration file: ~/.oracle-acc-config. This file could look like this:
```
username=<USERNAME>
password=<PASSWORD>
identity_domain=<IDENTITY DOMAIN>
storage_url=<URL for Oracle Storage Cloud Service REST API endpoint>
storage_container=<STORAGE CONTAINER>
manifest_path=<path for manifest.json file>
deployment_path=<path for deployment.json file>
```

In the root of your node application, run:

    $ npm acc-deploy -n "Application Name"
