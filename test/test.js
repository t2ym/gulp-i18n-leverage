/*
@license https://github.com/t2ym/gulp-i18n-leverage/blob/master/LICENSE.md
Copyright (c) 2016, Tetsuya Mori <t2y3141592@gmail.com>. All rights reserved.
*/
'use strict';

var chai = require('chai');
var assert = chai.assert;
var path = require('path');
var fs = require('fs');
var gutil = require('gulp-util');
var stream = require('stream');
var isStream = require('is-stream');
var gulp = require('gulp');
var debug = require('gulp-debug');

var through = require('through2');
var JSONstringify = require('json-stringify-safe');

var i18nLeverage = require('../');

chai.config.showDiff = true;

var cwd = process.cwd();
process.chdir(__dirname);

/*

## API

`i18nLeverage(options)`

### `options` object

- jsonSpace: Number, default: 2 - JSON stringification parameter for formatting
- srcPath: String, default: 'app' - Path to source root
- distPath: String, default: 'dist' - Path to dist root to fetch next default JSON files
- finalize: Boolean, default: false - Empty meta information if true
- bundles: Object, default {} - Output bundles object

*/

function convertToExpectedPath (file, srcBaseDir, expectedBaseDir) {
  var target;
  if (file.path) {
    target = file.path;
  }
  else {
    target = file;
  }
  if (target && srcBaseDir && expectedBaseDir) {
    srcBaseDir = srcBaseDir.replace(/\//g, path.sep);
    if (target.substr(0, srcBaseDir.length) === srcBaseDir) {
      target = path.join(expectedBaseDir.replace(/\//g, path.sep),
                        target.substr(srcBaseDir.length));
    }
    else {
      srcBaseDir = path.resolve(srcBaseDir);
      if (target.substr(0, srcBaseDir.length) === srcBaseDir) {
        target = path.join(expectedBaseDir.replace(/\//g, path.sep),
                          target.substr(srcBaseDir.length));
      }
    }
  }
  if (file.path) {
    file.path = target;
  }
  else {
    file = target;
  }
  return file;
}

function n2h (target) {
  if (path.sep === '/') {
    return target;
  }
  if (target) {
    if (Array.isArray(target)) {
      return target.map(function (item) { return n2h(item); });
    }
    else if (typeof target === 'string') {
      return target.replace(/\//g, path.sep);
    }
    else {
      return target;
    }
  }
  else {
    return target;
  }
}

// Test suite inheritance utilities
var p = Object.setPrototypeOf || function (target, base) { 
  var obj = Object.create(base);
  for (var p in target) {
    obj[p] = target[p];
  }
  return obj;
};
var _name = 'suite';
var suiteMap = {};
var s = function (name, baseName, extension) {
  if (suiteMap[name]) {
    throw new Error('duplicate suite name ' + name);
  }
  if (baseName && !suiteMap[baseName]) {
    throw new Error('inexistent base suite name ' + baseName);
  }
  extension[_name] = name;
  extension = p(extension, suiteMap[baseName] || {});
  suiteMap[name] = extension;
  return extension;
};

var options_base = {
  jsonSpace: 2,
  srcPath: 'src',
  distPath: 'expected',
  finalize: false,
  bundles: {}
};

var params_base = {
  suite: null,
  options: options_base,
  srcBaseDir: 'src',
  targets: [],
  expectedBaseDir: 'expected',
  expected: [],
  buffer: true
};

function fromTarget (target) {
  return target;
}

function fromExpectedBundles (expectedBaseDir) {
  var json = fs.readFileSync(path.join(expectedBaseDir, 'bundles.json'), 'utf8');
  return JSON.parse(json);
}

var suites = [
  s(null, null, params_base),
  s('simple-text-element', null, {
    options: p({
      bundles: {}
    }, options_base),
    targets: [ 'locales/simple-text-element.fr.json' ],
    expected: fromTarget
  }),
  s('gulp simple-text-element', 'simple-text-element', {
    gulp: true
  }),
  s('fallback-text-element', 'simple-text-element', {
    options: p({
      bundles: {}
    }, options_base),
    targets: [ 'locales/fallback-text-element.fr-CA.json' ],
    expected: fromTarget    
  }),  
  s('missing fallback-text-element', 'simple-text-element', {
    options: p({
      bundles: {}
    }, options_base),
    targets: [ 'locales/fallback-text-element.zh-Hans-CN.json' ],
    expected: fromTarget    
  }),  
  s('error-element', 'simple-text-element', {
    options: p({
      bundles: {}
    }, options_base),
    targets: [ 'locales/error-element.fr.json' ],
    expected: fromTarget    
  }),  
  s('absolute srcPath/distPath', 'simple-text-element', {
    options: p({
      srcPath: path.resolve('src'),
      distPath: path.resolve('expected'),
      bundles: {}
    }, options_base)
  }),
  s('gulp absolute srcPath/distPath', 'absolute srcPath/distPath', {
    gulp: true
  }),
  s('empty file', 'simple-text-element', {
    targets: [ 'locales/simple-text-element-empty.fr.json' ]
  }),
  s('gulp empty file', 'empty file', {
    gulp: true
  }),
  s('updated', 'simple-text-element', {
    targets: [ 'locales/simple-text-element-updated.fr.json' ]
  }),
  s('gulp updated', 'updated', {
    gulp: true
  }),
  s('finalize meta', 'simple-text-element', {
    options: p({
      finalize: true,
      bundles: {}
    }, options_base),
    targets: [ 'locales/simple-text-element-finalize.fr.json' ]
  }),
  s('gulp finalize meta', 'finalize meta', {
    gulp: true
  }),
  s('gulp no buffer', 'simple-text-element', {
    gulp: true,
    buffer: false,
    expected: [],
    throw: 'Streaming not supported'
  }),
  s('null file', 'simple-text-element', {
    isNull: true,
    expected: fromTarget
  }),
  s('bundles', 'simple-text-element', {
    targets: [ 
      'locales/error-element.fr.json',
      'locales/simple-text-element.fr.json',
      'locales/simple-text-element-empty.fr.json',
      'locales/simple-text-element-empty-json.fr.json',
      'locales/simple-text-element-updated.fr.json',
      'locales/fallback-text-element.fr.json',
      'locales/fallback-text-element.fr-CA.json',
      'locales/fallback-text-element.zh-Hans-CN.json'
    ],
    bundles: fromExpectedBundles
  }),
  s('gulp bundles', 'simple-text-element', {
    gulp: true,
    targets: [ '**/locales/*.json', '!locales/simple-text-element-finalize.fr.json' ],
    expected: [ 
      'locales/error-element.fr.json',
      'locales/simple-text-element.fr.json',
      'locales/simple-text-element-empty.fr.json',
      'locales/simple-text-element-empty-json.fr.json',
      'locales/simple-text-element-updated.fr.json',
      'locales/fallback-text-element.fr.json',
      'locales/fallback-text-element.fr-CA.json',
      'locales/fallback-text-element.zh-Hans-CN.json'
    ],
    bundles: fromExpectedBundles
  })
];

suite('gulp-i18n-leverage', function () {
  suites.forEach(function (params) {
    var leverage;
    var options = params.options;
    var inputs;
    var expandedInputPaths;
    var outputs;
    var expectedPaths;
    var expected;
    var bundles;

    if (!params.suite) {
      return;
    }

    suite(params.suite, function () {
      suiteSetup(function () {
        if (params.gulp && 
          !params.options.constructBundles &&
          typeof params.options.bundles === 'function') {
          options.bundles = params.options.bundles(params.expectedBaseDir);
        }
        leverage = i18nLeverage(options);
        inputs = params.gulp ? 
          params.targets.map(function (target) {
            return target.match(/^!/) ? 
              '!' + [ params.srcBaseDir, target.substr(1) ].join('/') :
              [ params.srcBaseDir, target ].join('/')
          }) :
          params.targets.map(function (target) {
            return new gutil.File({
              cwd: __dirname,
              base: n2h(params.options.srcPath),
              path: path.join(n2h(params.srcBaseDir), target),
              contents: params.isNull ? null : fs.readFileSync(path.join(n2h(params.srcBaseDir), target))
            });
          });
        outputs = [];
        if (params.expected) {
          expectedPaths = undefined;
          if (!params.gulp &&
            typeof params.expected === 'function') {
            expectedPaths = params.expected(params.targets).map(function (outputPath) {
                return path.join(params.expectedBaseDir, n2h(outputPath));
              });
          }
          else if (Array.isArray(params.expected)) {
            expectedPaths = params.expected.map(function (outputPath) {
                return path.join(params.expectedBaseDir, n2h(outputPath));
              });
          }
          expected = expectedPaths ? 
            expectedPaths.map(function (target) {
              return new gutil.File({
                cwd: __dirname,
                base: path.join(__dirname, n2h(params.expectedBaseDir)),
                path: target,
                contents: params.isNull ? null : fs.readFileSync(target)
              })
            }) : null;
        }
        if (params.gulp) {
          expandedInputPaths = [];
        }
        if (params.bundles) {
          bundles = {};
          params.options.bundles = bundles;
        }
      });

      test('get a duplex stream', function () {
        assert.ok(isStream.duplex(leverage), 'leverage is a duplex stream');
      });

      if (params.gulp) {
        test('leverage in gulp', function (done) {
          gulp.task('leverage', function () {
            return gulp.src(inputs, { base: params.options.srcPath, buffer: params.buffer })
              .pipe(through.obj(function (file, enc, callback) {
                expandedInputPaths.push(file.path);
                callback(null, file);
              }))
              .pipe(leverage)
              .on('error', function (err) {
                if (params.throw) {
                  assert.equal(err.message, params.throw, 'Throws ' + params.throw);
                  done();
                }
                else {
                  throw err;
                }
              })
              .pipe(through.obj(function (file, enc, callback) {
                assert.ok(file.path && file.contents, 'get a file for ' + file.path);
                convertToExpectedPath(file, params.srcBaseDir, params.expectedBaseDir);
                outputs.push(file);
                callback(null, file);
              }))
              //.pipe(debug({ title: 'leverage output:'}))
              .pipe(through.obj(function (file, enc, callback) {
                callback(null, null);
              }));
          });
          gulp.start.apply(gulp, [ 'leverage', function () {
            gulp.reset();
            done();
          }]);
        });
      }
      else {
        test('get leveraged files', function (done) {
          leverage.on('data', function (file) {
            //console.log('on data ' + file.path);
            assert.ok(file instanceof gutil.File, 'get a File instance for ' + file.path);
            convertToExpectedPath(file, params.srcBaseDir, params.expectedBaseDir);
            outputs.push(file);
          });

          leverage.on('end', done);

          inputs.forEach(function (file) {
            //console.log('file.path = ' + file.path);
            //console.log('file.contents = ' + file.contents.toString());
            leverage.write(file);
          });

          leverage.end();
        });
      }

      if ((params.expected && params.expected.length > 0) ||
          !params.expected) {
        if (params.expected) {
          test('check leveraged file list', function () {
            if (params.gulp) {
              if (typeof params.expected === 'function' &&
                  expandedInputPaths) {
                expectedPaths = params.expected(expandedInputPaths).map(function (target) {
                  var result = convertToExpectedPath(target, params.srcBaseDir, params.expectedBaseDir);
                  return result;
                });
              }
              else if (Array.isArray(params.expected)) {
                expectedPaths = params.expected.map(function (target) {
                  return path.join(params.expectedBaseDir, target);
                });
              }
            }
            outputs.forEach(function (file, index) {
              console.log(file.path);
              assert.ok(expectedPaths.indexOf(file.path) >= 0, file.path + ' is output');
            });
            assert.equal(outputs.length, expectedPaths.length,
              'get expected ' + expectedPaths.length + ' files');
          });
        }

        test('check leveraged file contents', function () {
          outputs.forEach(function (file, index) {
            var expectedFile = null;
            if (expected) {
              if (expectedPaths.indexOf(file.path) >= 0) {
                expectedFile = expected[expectedPaths.indexOf(file.path)];
              }
              else {
                assert.ok(expectedFile, file.path + ' is in expected');   
              }
            }
            else {
              expectedFile = new gutil.File({
                cwd: __dirname,
                base: file.base,
                path: file.path,
                contents: params.isNull ? null : fs.readFileSync(file.path)
              });
            }
            if (file.contents && file.contents.toString() !== expectedFile.contents.toString()) {
              console.log('file.path = ' + file.path);
              console.log('expected = ' + expectedFile.contents.toString());
              console.log('actual = ' + file.contents.toString());
            }
            if (params.isNull) {
              assert.ok(file.isNull(),
                'get expected null file contents for ' + expectedFile.path);
            }
            else {
              assert.equal(file.contents.toString(), expectedFile.contents.toString(),
                'get expected file contents for ' + expectedFile.path);
            }
          });
        });
      }
      else {
        test('no outputs', function () {
          assert.equal(outputs.length, 0, 'get no outputs');
        });
      }

      if (params.bundles) {
        test('check bundles', function () {
          var expectedBundles;
          if (typeof params.bundles === 'function') {
            expectedBundles = params.bundles(params.expectedBaseDir);
          }
          else {
            expectedBundles = params.bundles;
          }
          //console.log('bundles = \n' + JSONstringify(bundles, null, 2));
          assert.deepEqual(bundles,
            expectedBundles,
            'get expected bundles');
        });
      }

      suiteTeardown(function () {
      });
    });
  });
});
