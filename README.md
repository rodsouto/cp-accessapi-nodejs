# cp-accessapi-nodejs
CrownPeak AccessAPI interface for NodeJS

Includes command line interface that can be installed globally:
```
$ npm install -g crownpeak-accessapi
$ crownpeak init       # first step, initialize an accessapi-config.json file, includes API key and credentials for a user
$ crownpeak list "/"  # list contents of root folder
$ echo -n Welcome | crownpeak update /Test --field=body  # opens asset "/Test" and updates the body field to "Welcome"
$ crownpeak route /Test Live  # routes Test to Live workflow status
```

