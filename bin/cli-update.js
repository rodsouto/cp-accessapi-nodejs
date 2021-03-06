#!/usr/bin/env node

var program = require('commander');
var prompt = require('prompt');
var fs = require('fs');
var util = require('util');
var chalk = require('chalk');
var Q = require('q');

var cli_util = require('./cli_util');
var log = cli_util.createLogger();

process.on('exit', () => { process.exit(0); })

var constants = {
  configJsonName: "accessapi-config.json"
};

program
  .name('update')

program
  .option('--config <file>', 'a config file to use. defaults to using ./accessapi-config.json', 'accessapi-config.json')
  .option('-i,--instance', 'instance (required if multiple instances defined in the config file)')
  .option('--stdin', 'read input from stdin')
  .option('--as', 'set type of asset to be one of: developercs (updates body field) or binary (updates binary data). others defined later. this option used with file input or --stdin')
  .option('--field <field>', 'update using a specific field name, use when updating from a file or stdin without json')
  .option('--runPostInput','run post input plugin for the asset\'s template', false)
  .option('--runPostSave', 'run post save plugin on the asset\'s template', false)
  .arguments("<assetPath> [inputFile]")
  .action(function (assetPath, inputFile) {
    program.assetPath = assetPath;
    program.inputFile = inputFile;
  })

program
  .parse(process.argv)

log.debug('program.config',program.config);
log.debug('program.assetPath',program.assetPath);

function getContentObject (program, encoding) {
  if (log.isDebugEnabled) log.debug('begin reading content');
  var deferred = Q.defer();
  var collector = Q.defer();

  collector.promise.done((content)=> {
    
    if(Buffer.isBuffer(content) || typeof content === 'string') {
      log.debug('content is buffer or string. program.field=%s', program.field);
      if (program.field == undefined) {
        fail('Content wasnt parseable as json, and no --field parameter specified.');
        program.help();
      }
    }

    if(Buffer.isBuffer(content)) {
      fieldsJson = {};
      fieldsJson[program.field] = content.toString('utf8');
    }

    if(typeof content === 'string') {
      fieldsJson = {};
      fieldsJson[program.field] = content;
    }

    if(typeof content === 'object') {
      fieldsJson = content;
    }

    deferred.resolve(fieldsJson);
  }, (err) => {
    deferred.reject(err);
  });
      
  if (program.stdin) {
    log.debug('reading content from stdin');
  
    var stdin = process.stdin;
    var stdout = process.stdout;
    
    var inputChunks = [];
    
    stdin.on('data', function (data) {
      if (log.isDebugEnabled) log.debug('chunk:',data);
      if (Buffer.isBuffer(data)) data = data.toString('utf8');
      inputChunks.push(data);
    });
    
    stdin.on('end', function () {
      var contentStr = (inputChunks.length == 1 ? inputChunks[0] : inputChunks.join(""));
      
      try {
        var parsedData = JSON.parse(contentStr);
        collector.resolve(parsedData);
        return;
      }
      catch(ex) { }
      
      collector.resolve(contentStr);
    });

  } else if(program.inputFile !== undefined) {
    //read file name from program.args[2]
    log.debug("reading from file='%s'." , program.inputFile);
    
    Q.nfcall(fs.readFile, program.inputFile, { 'encoding': 'utf8' }).then(function(res) {
      try {
        var fields = JSON.parse(res);
        collector.resolve(fields);
      } catch(ex) {}
      
      if(fields === undefined) {
        fields = {};
        fields[program.field] = res;
        collector.resolve(fields);
      }
    });

  } else { //read from file
    
    cli_util.fail('field not set.');
  }

  
  
  return deferred.promise;
}

main = function () {

var exitcode=-1;

  if (typeof program.assetPath === 'undefined') {
    cli_util.fail('no assetPath specified.');
    exitcode=1;
  }

  if (program.inputFile == undefined && program.field == undefined && program.stdin == undefined) {
    cli_util.fail('no inputFile specified and --stdin not specified.  Cannot update.');
    exitcode=1;
  }

  if(exitcode>0) { program.help();process.exit(exitcode); }
  
  log.debug('Loading config from %s.', program.config);
  if (fs.existsSync(program.config)==false) {
    cli_util.fail('Failed to load config from %s: file doesn\'t exist.', program.config);
    process.exit(1); 
  }

  //var reader = require('./accessapi-json-config-reader');
  var accessapiConfig = JSON.parse(fs.readFileSync(program.config));
  
  log.debug('accessapiConfig:', accessapiConfig);

  cli_util.status(`Instance: ${accessapiConfig.instance}   Sign in as: ${accessapiConfig.username}`);
  cli_util.status(`Updating: ${program.assetPath}`);
  
  var accessapi = require('../index');
  accessapi.setConfig(accessapiConfig);
  
  cli_util.status('');
  cli_util.status('Authenticating.');
  accessapi.auth().then(function (data) {
    
    var assetIdOrPath = program.assetPath;

    log.debug('calling AssetExists');
    accessapi.AssetExists(assetIdOrPath).then(function (existsResp) {
      
      //existsResp documented http://developer.crownpeak.com/Documentation/AccessAPI/AssetController/Methods/Exists(AssetExistsRequest).html
      var workflowAssetId = existsResp.json.assetId;
      
      getContentObject(program).then(function (contentObject) {
        
        if(log.isDebugEnabled) {
          log.debug('fieldsJson from getContent:', contentObject);
        }

        var options={};
        if(program.runPostInput != undefined)
          options.runPostInput = program.runPostInput;

        if(program.runPostSave != undefined)
          options.runPostSave = program.runPostSave;

        log.debug('calling AssetUpdate. options=%j', options);
        accessapi.AssetUpdate(workflowAssetId, contentObject, null, options).then(function() {
          cli_util.status('Success updating %s.', program.assetPath);
        })

      });

    });

  }, function(err) {
    cli_util.fail('Authentication failure: %s', err.resultCode);
  }).catch(function (err) {
    log.error("error occurred:", err);
  }).done();

}();
