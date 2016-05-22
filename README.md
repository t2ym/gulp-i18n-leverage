[![Build Status](https://travis-ci.org/t2ym/gulp-i18n-leverage.svg?branch=master)](https://travis-ci.org/t2ym/gulp-i18n-leverage)
[![Coverage Status](https://coveralls.io/repos/github/t2ym/gulp-i18n-leverage/badge.svg?branch=master)](https://coveralls.io/github/t2ym/gulp-i18n-leverage?branch=master)
[![npm](https://img.shields.io/npm/v/gulp-i18n-leverage.svg)](https://www.npmjs.com/package/gulp-i18n-leverage)

# gulp-i18n-leverage

Merge changes in default JSON into localized JSON for [i18n-behavior](https://github.com/t2ym/i18n-behavior)

Project template available at [polymer-starter-kit-i18n](https://github.com/t2ym/polymer-starter-kit-i18n). On Github Pages (https://t2ym.github.io/polymer-starter-kit-i18n)

## Features

- Merge changes in next default JSON from current default JSON into next localized JSON with the help of [rfc6902](https://github.com/chbrown/rfc6902)
- Put meta information on merged changes in meta property in JSON for ease of translation
- Output bundles object to merge all the UI texts into JSON per locale
- Export the merged localized JSON as files

## Install

```
    npm install --save-dev gulp-i18n-leverage
```

[Quick Tour](#quick-tour)

## Workflow

Build tasks from source to dist:

### 1. Scan task with [gulp-i18n-preprocess](https://github.com/t2ym/gulp-i18n-preprocess)

### 2. Preprocess task with [gulp-i18n-preprocess](https://github.com/t2ym/gulp-i18n-preprocess)

### 3. Leverage task 

  - Update localized JSON files by merging differences in default JSON from the previous build
  - Put them in dist
  - Merge all the UI texts into bundles object

### 4. Bundles task with `fs.writeFileSync()`

  - Generate default bundled JSON file `bundle.json` from the bundles object
  - Generate per-locale bundled JSON files `bundle.*.json` from the bundles object
  - Put them in dist

### 5. Feedback task with [gulp-i18n-preprocess](https://github.com/t2ym/gulp-i18n-preprocess)

  - Update default and localized JSON files in source to commit them later by a developer or a build system

## Usage

### Default options

Sample to show default options:

```javascript
    var gulp = require('gulp');
    var i18nLeverage = require('gulp-i18n-leverage');

    gulp.task('leverage', function () {
      return gulp.src([ 'app/**/locales/*.json' ]) // input localized JSON files in source
        .pipe(i18nLeverage({
          jsonSpace: 2, // default JSON format with 2 spaces
          srcPath: 'app', // default path to source root
          distPath: 'dist', // default path to dist root to fetch next default JSON files
          finalize: false, // empty meta information if true
          bundles: {} // default output bundles object is empty
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Scan task

#### Note: Target HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input: 
  - Custom element HTMLs in source

#### Output: 
  - attributesRepository object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Global object to store localizable attributes repository
    var attributesRepository = {};

    // Scan HTMLs and construct localizable attributes repository
    gulp.task('scan', function () {
      return gulp.src([ 'app/elements/**/*.html' ]) // input custom element HTMLs
        .pipe(i18nPreprocess({
          constructAttributesRepository: true, // construct attributes repository
          attributesRepository: attributesRepository, // output object
          srcPath: 'app', // path to source root
          attributesRepositoryPath: 
            'bower_components/i18n-behavior/i18n-attr-repo.html', // path to i18n-attr-repo.html
          dropHtml: true // drop HTMLs
        })) 
        .pipe(gulp.dest('dist/elements')); // no outputs; dummy output path
    });
```

### Preprocess task

#### Note: Target custom element HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input: 
  - Custom element HTMLs
  - Non-custom-element HTMLs in source

#### Output: 
  - Preprocessed HTMLs and default JSON files in dist

```javascript
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Global object to store localizable attributes repository
    var attributesRepository; // constructed attributes repository

    // Other standard pipes such as crisper / minification / uglification are omitted for explanation
    gulp.task('preprocess', function () {
      var elements = gulp.src([ 'app/elements/**/*.html' ]) // input custom element HTMLs
        .pipe(i18nPreprocess({
          replacingText: true, // replace UI texts with {{annotations}}
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          attributesRepository: attributesRepository // input attributes repository
        })))
        .pipe(gulp.dest('dist/elements')); // output preprocessed HTMLs and default JSON files to dist

      var html = gulp.src([ 'app/**/*.html', '!app/{elements,test}/**/*.html' ]) // non-custom-element HTMLs
        .pipe(i18nPreprocess({
          replacingText: true, // replace UI texts with {{annotations}}
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          force: true, // force processing even without direct i18n-behavior.html import
          attributesRepository: attributesRepository // input attributes repository
         }))
        .pipe(gulp.dest('dist'));

      return merge(elements, html)
        .pipe($.size({title: 'copy'}));
    });
```

### Import XLIFF task (experimental)

#### Note: This task has to be processed before [Leverage task with unbundle](#leverage-task-with-unbundle) to pick up outputs of this task.

#### Input:
  - Next XLIFF files in source
  - Current bundle JSON files in source (as output templates)

#### Output:
  - Overwritten bundle JSON files in source

```javascript
    var gulp = require('gulp');
    var JSONstringify = require('json-stringify-safe');
    var through = require('through2');
    var xliff2bundlejson = require('xliff2bundlejson');

    // Import bundles.{lang}.xlf
    gulp.task('import-xliff', function () {
      var xliffPath = path.join('app', 'xliff');
      var x2j = new xliff2bundlejson({});
      return gulp.src([
          'app/**/xliff/bundle.*.xlf'
        ])
        .pipe(through.obj(function (file, enc, callback) {
          var bundle, bundlePath;
          var base = path.basename(file.path, '.xlf').match(/^(.*)[.]([^.]*)$/);
          var xliff = String(file.contents);
          if (base) {
            try {
              bundlePath = path.join(file.base, 'locales', 'bundle.' + base[2] + '.json');
              bundle = JSON.parse(stripBom(fs.readFileSync(bundlePath, 'utf8')));
              x2j.parseXliff(xliff, { bundle: bundle }, function (output) {
                file.contents = new Buffer(JSONstringify(output, null, 2));
                file.path = bundlePath;
                callback(null, file);
              });
            }
            catch (ex) {
              callback(null, file);
            }
          }
          else {
            callback(null, file);
          }
        }))
        .pipe(gulp.dest('app'))
        .pipe($.size({
          title: 'import-xliff'
        }));
    });
```

### Leverage task

#### Input:
  - Current localized JSON files in source
  - Current default JSON files in source
  - Next default JSON files in dist

#### Output:
  - Next localized JSON files in dist
  - Bundles object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nLeverage = require('gulp-i18n-leverage');

    var bundles = {};

    gulp.task('leverage', function () {
      return gulp.src([ 'app/**/locales/*.json' ]) // input localized JSON files in source
        .pipe(i18nLeverage({
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          distPath: 'dist', // path to dist root to fetch next default JSON files
          finalize: false, // keep meta information
          bundles: bundles // output bundles object
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Leverage task with unbundle

#### Note: If translation is done in locales/bundle.*.json in source for all the elements, contents of per-element json are discarded and replaced with those in the bundle. The per-element json files will be translated in [feedback task](#feedback-task).

#### Input:
  - Current localized bundle JSON files in source
  - Current localized JSON files in source (contents are discarded)
  - Current default JSON files in source
  - Next default JSON files in dist

#### Output:
  - Next localized JSON files in dist
  - Bundles object in gulpfile.js

```javascript
    var gulp = require('gulp');
    var i18nLeverage = require('gulp-i18n-leverage');
    var through = require('through2'); // for unbundle
    var stripBom = require('strip-bom'); // for unbundle

    var bundles = {};

    gulp.task('leverage', function () {
      return gulp.src([ 'app/**/locales/*.json', '!app/**/locales/bundle.*.json' ]) // exclude bundles
        // replace contents with unbundled ones
        .pipe(through.obj(function (file, enc, callback) {
          var bundle, base = path.basename(file.path, '.json').match(/^(.*)[.]([^.]*)$/);
          if (base) {
            try {
              bundle = JSON.parse(stripBom(fs.readFileSync(path.join(file.base, 'locales', 'bundle.' + base[2] + '.json'), 'utf8')));
              if (bundle[base[1]]) {
                file.contents = new Buffer(JSONstringify(bundle[base[1]], null, 2));
              }
            }
            catch (ex) {}
          }
          callback(null, file);
        }))
        .pipe(i18nLeverage({
          jsonSpace: 2, // JSON format with 2 spaces
          srcPath: 'app', // path to source root
          distPath: 'dist', // path to dist root to fetch next default JSON files
          finalize: false, // keep meta information
          bundles: bundles // output bundles object
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Bundles task

#### Input: 
  - Bundles object in gulpfile.js

#### Output: 
  - Bundles JSON files in dist

```javascript
    var gulp = require('gulp');
    var fs = require('fs');
    var JSONstringify = require('json-stringify-safe');

    var bundles; // constructed bundles

    gulp.task('bundles', function (callback) {
      var DEST_DIR = 'dist';
      var localesPath = join.path(DEST_DIR, 'locales');

      try {
        fs.mkdirSync(localesPath);
      }
      catch (e) {}
      for (var lang in bundles) {
        bundles[lang].bundle = true;
        if (lang) {
          fs.writeFileSync(localesPath + '/bundle.' + lang + '.json', 
                            JSONstringify(bundles[lang], null, 2));
        }
        else {
          fs.writeFileSync(DEST_DIR + '/bundle.json', 
                            JSONstringify(bundles[lang], null, 2));
        }
      }
      callback();
    });
```

### Export XLIFF task (experimental)

#### Note: This task has to be processed after [Bundles task](#bundles).  `srcLanguage` must match with the default language of the app.

#### Input:
  - Next bundles object in gulpfile.js

#### Output:
  - bundle.{lang}.xlf XLIFF in DEST_DIR/xliff

```javascript
    var gulp = require('gulp');
    var through = require('through2');
    var xliff2bundlejson = require('xliff2bundlejson');

    // Generate bundles.{lang}.xlf
    gulp.task('export-xliff', function (callback) {
      var DEST_DIR = 'dist';
      var srcLanguage = 'en';
      var xliffPath = path.join(DEST_DIR, 'xliff');
      var x2j = new xliff2bundlejson({
        date: new Date() // XLIFF's date attribute
      });
      var promises = [];
      try {
        fs.mkdirSync(xliffPath);
      }
      catch (e) {
      }
      for (var lang in bundles) {
        if (lang) {
          (function (destLanguage) {
            promises.push(new Promise(function (resolve, reject) {
              x2j.parseJSON(bundles, {
                srcLanguage: srcLanguage,
                destLanguage: destLanguage
              }, function (output) {
                fs.writeFile(path.join(xliffPath, 'bundle.' + destLanguage + '.xlf'), output, resolve);
              });
            }));
          })(lang);
        }
      }
      Promise.all(promises).then(function (outputs) {
        callback();
      });
    });
```

### Feedback task

#### Note: Target custom element HTMLs must import [i18n-behavior.html](https://github.com/t2ym/i18n-behavior) directly.

#### Input:
  - Next localized JSON files in dist
  - Next localized XLIFF files in dist
  - Custom element HTMLs
  - Non-custom-element HTMLs

#### Output:
  - Overwritten localized JSON files in source
  - Overwritten default JSON files in source
  - Overwritten bundle JSON files in source [if translation is done in bundles](#leverage-task-with-unbundle)
  - Overwritten bundle XLIFF files in source if XLIFF import/export are setup

Outputs are ready to commit in the repository

```
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Only applicable to development builds; Skip it in production builds
    gulp.task('feedback', function () {
      // Copy from dist
      var locales = gulp.src([
          'dist/**/locales/*.json',
          'dist/**/xliff/bundle.*.xlf', // Add this item if xliff import and export are enabled
          //'!dist/locales/bundle.*.json' // Remove this item if translation is done in bundles
        ])
        .pipe(gulp.dest('app'));

      // Regenerate default JSON files
      var elementDefault = gulp.src([ 'app/elements/**/*.html' ])
        .pipe(i18nPreprocess({
          replacingText: false,
          jsonSpace: 2,
          srcPath: 'app',
          dropHtml: true,
          attributesRepository: attributesRepository
        }))
        .pipe(gulp.dest('app/elements'));

      // Regenerate default JSON files for non-custom-element HTMLs, i.e., i18n-dom-bind
      var appDefault = gulp.src([ 'app/**/*.html', '!app/{elements,test}/**/*.html' ])
        .pipe(i18nPreprocess({
          replacingText: false,
          jsonSpace: 2,
          srcPath: 'app',
          force: true,
          dropHtml: true,
          attributesRepository: attributesRepository
        }))
        .pipe(gulp.dest('app'));

      return merge(locales, elementDefault, appDefault)
        .pipe($.size({title: 'feedback'}));
    });
```

### Integrate with polymer-cli project templates (highly experimental)

#### Note:
  - As of [`polymer-cli 0.8.0`](https://github.com/Polymer/polymer-cli), `polymer` command and the project templates are pre-release and subject to change including the private API `userTransformers` on which this integration works.

#### Set up `package.json` and the dependent packages of the following `guilfile.js`

```sh
    npm init # if package.json is missing
    npm install --save-dev gulp gulp-debug gulp-grep-contents \
      gulp-i18n-add-locales gulp-i18n-leverage gulp-i18n-preprocess \
      gulp-if gulp-match gulp-merge gulp-size gulp-sort gulp-util \
      json-stringify-safe strip-bom through2 xliff-conv
```

#### User Transformers:
  - scan - Scan HTMLs and construct localizable attributes repository
  - basenameSort - Sort source files according to their base names; Bundle files come first.
  - preprocess - Preprocess Polymer templates for I18N
  - tmpJSON - Store extracted JSON in the temporary folder .tmp
  - importXliff - Import XLIFF into JSON
  - leverage - Merge changes in default JSON into localized JSON
  - exportXliff - Generate bundles and export XLIFF
  - feedback - Update JSON and XLIFF in sources
  - debug - Show the list of processed files including untouched ones
  - size - Show the total size of the processed files

#### Gulp task:
  - `gulp locales --targets="{space separated list of target locales}"`

#### gulpfile.js: Put it in the root folder of the project
```javascript
    var gulp = require('gulp');
    var gutil = require('gulp-util');
    var debug = require('gulp-debug');
    var gulpif = require('gulp-if');
    var gulpmatch = require('gulp-match');
    var sort = require('gulp-sort');
    var grepContents = require('gulp-grep-contents');
    var size = require('gulp-size');
    var merge = require('gulp-merge');
    var through = require('through2');
    var path = require('path');
    var stripBom = require('strip-bom');
    var JSONstringify = require('json-stringify-safe');
    var i18nPreprocess = require('gulp-i18n-preprocess');
    var i18nLeverage = require('gulp-i18n-leverage');
    var XliffConv = require('xliff-conv');
    var i18nAddLocales = require('gulp-i18n-add-locales');

    // Global object to store localizable attributes repository
    var attributesRepository = {};

    // Bundles object
    var prevBundles = {};
    var bundles = {};

    var title = 'I18N transform';
    var tmpDir = '.tmp';

    // Scan HTMLs and construct localizable attributes repository
    var scan = gulpif('*.html', i18nPreprocess({
      constructAttributesRepository: true, // construct attributes repository
      attributesRepository: attributesRepository, // output object
      srcPath: '.', // path to source root
      attributesRepositoryPath: 
        'bower_components/i18n-behavior/i18n-attr-repo.html', // path to i18n-attr-repo.html
      dropHtml: false // do not drop HTMLs
    }));

    var basenameSort = sort({
      comparator: function(file1, file2) {
        var base1 = path.basename(file1.path).replace(/^bundle[.]/, ' bundle.');
        var base2 = path.basename(file2.path).replace(/^bundle[.]/, ' bundle.');
        return base1.localeCompare(base2);
      }
    });

    var preprocess = gulpif('*.html', i18nPreprocess({
      replacingText: true, // replace UI texts with {{annotations}}
      jsonSpace: 2, // JSON format with 2 spaces
      srcPath: '.', // path to source root
      attributesRepository: attributesRepository // input attributes repository
    }));

    var tmpJSON = gulpif([ 'src/**/*.json', '!src/**/locales/*' ], gulp.dest(tmpDir));

    var unbundleFiles = [];
    var importXliff = through.obj(function (file, enc, callback) {
      // bundle files must come earlier
      unbundleFiles.push(file);
      callback();
    }, function (callback) {
      var match;
      var file;
      var bundleFileMap = {};
      var xliffConv = new XliffConv();
      while (unbundleFiles.length > 0) {
        file = unbundleFiles.shift();
        if (path.basename(file.path).match(/^bundle[.]json$/)) {
          prevBundles[''] = JSON.parse(stripBom(String(file.contents)));
          bundleFileMap[''] = file;
        }
        else if (match = path.basename(file.path).match(/^bundle[.]([^.\/]*)[.]json$/)) {
          prevBundles[match[1]] = JSON.parse(stripBom(String(file.contents)));
          bundleFileMap[match[1]] = file;
        }
        else if (match = path.basename(file.path).match(/^bundle[.]([^.\/]*)[.]xlf$/)) {
          xliffConv.parseXliff(String(file.contents), { bundle: prevBundles[match[1]] }, function (output) {
            if (bundleFileMap[match[1]]) {
              bundleFileMap[match[1]].contents = new Buffer(JSONstringify(output, null, 2));
            }
          });
        }
        else if (gulpmatch(file, '**/locales/*.json') &&
                 (match = path.basename(file.path, '.json').match(/^([^.]*)[.]([^.]*)/))) {
          if (prevBundles[match[2]] && prevBundles[match[2]][match[1]]) {
            file.contents = new Buffer(JSONstringify(prevBundles[match[2]][match[1]], null, 2));
          }
        }
        this.push(file);
      }
      callback();
    });

    var leverage = gulpif([ 'src/**/locales/*.json', '!**/locales/bundle.*.json' ], i18nLeverage({
      jsonSpace: 2, // JSON format with 2 spaces
      srcPath: '', // path to source root
      distPath: '/' + tmpDir, // path to dist root to fetch next default JSON files
      bundles: bundles // output bundles object
    }));

    var bundleFiles = [];
    var exportXliff = through.obj(function (file, enc, callback) {
      bundleFiles.push(file);
      callback();
    }, function (callback) {
      var file;
      var cwd = bundleFiles[0].cwd;
      var base = bundleFiles[0].base;
      var xliffConv = new XliffConv();
      var srcLanguage = 'en';
      var promises = [];
      var self = this;
      while (bundleFiles.length > 0) {
        file = bundleFiles.shift();
        if (!gulpmatch(file, [ '**/bundle.json', '**/locales/bundle.*.json', '**/xliff/bundle.*.xlf' ])) {
          this.push(file);
        }
      }
      for (var lang in bundles) {
        bundles[lang].bundle = true;
        this.push(new gutil.File({
          cwd: cwd,
          base: base,
          path: lang ? path.join(cwd, 'locales', 'bundle.' + lang + '.json')
                     : path.join(cwd, 'bundle.json'),
          contents: new Buffer(JSONstringify(bundles[lang], null, 2))
        }));
      }
      for (var lang in bundles) {
        if (lang) {
          (function (destLanguage) {
            promises.push(new Promise(function (resolve, reject) {
              xliffConv.parseJSON(bundles, {
                srcLanguage: srcLanguage,
                destLanguage: destLanguage
              }, function (output) {
                self.push(new gutil.File({
                  cwd: cwd,
                  base: base,
                  path: path.join(cwd, 'xliff', 'bundle.' + destLanguage + '.xlf'),
                  contents: new Buffer(output)
                }));
                resolve();
              });
            }));
          })(lang);
        }
      }
      Promise.all(promises).then(function (outputs) {
        callback();
      });
    });

    var feedback = gulpif([ '**/bundle.json', '**/locales/*.json', '**/src/**/*.json', '**/xliff/bundle.*.xlf' ], gulp.dest('.'));

    var config = {
      // list of target locales to add
      locales: gutil.env.targets ? gutil.env.targets.split(/ /) : []
    }

    // Gulp task to add locales to I18N-ready elements and pages
    // Usage: gulp locales --targets="{space separated list of target locales}"
    gulp.task('locales', function() {
      var elements = gulp.src([ 'src/**/*.html' ], { base: '.' })
        .pipe(grepContents(/i18n-behavior.html/))
        .pipe(grepContents(/<dom-module /));

      var pages = gulp.src([ 'index.html' ], { base: '.' })
        .pipe(grepContents(/is=['"]i18n-dom-bind['"]/));

      return merge(elements, pages)
        .pipe(i18nAddLocales(config.locales))
        .pipe(gulp.dest('.'))
        .pipe(debug({ title: 'Add locales:'}))
    });

    module.exports = {
      transformers: [
        scan,
        basenameSort,
        preprocess,
        tmpJSON,
        importXliff,
        leverage,
        exportXliff,
        feedback,
        debug({ title: title }),
        size({ title: title })
      ]
    };
```

## API

`i18nLeverage(options)`

### `options` object

- jsonSpace: Number, default: 2 - JSON stringification parameter for formatting
- srcPath: String, default: 'app' - Path to source root
- distPath: String, default: 'dist' - Path to dist root to fetch next default JSON files
- finalize: Boolean, default: false - Empty meta information if true
- bundles: Object, default {} - Output bundles object

## Quick Tour

### Quick demo deployment

```
    git clone https://github.com/t2ym/polymer-starter-kit-i18n.git
    cd polymer-starter-kit-i18n
    npm install -g gulp bower # if missing
    npm install && bower install
    # Development build with scan/preprocess/leverage/bundle/feedback tasks
    gulp --dev
    # Run-time I18N demo on http://localhost:5000
    gulp serve
    # Build-time I18N demo on http://localhost:5001
    gulp serve:dist --dev
```

### Change language on the demo

##### 1. Press F12 to open debugger console on the browser

##### 2. Navigate to the elements or DOM tab in the debugger

##### 3. Change `lang` attribute of `html` element from "en" to "ja" or "fr"

```
    <html lang="ja">
```

### Update UI strings on the demo

##### 1. Change any UI strings in the following HTMLs

```
    polymer-starter-kit-i18n/app/index.html
                                /elements/my-greeting/my-greeting.html
                                /elements/my-list/my-list.html
```

##### 2. Merge changes into JSON files

```
    cd polymer-starter-kit-i18n
    gulp --dev
```

##### 3. Check diffs

```
    git diff app
```

## License

[BSD-2-Clause](https://github.com/t2ym/gulp-i18n-leverage/blob/master/LICENSE.md)
