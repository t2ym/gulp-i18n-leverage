# gulp-i18n-leverage

Merge changes in default JSON into localized JSON for [i18n-behavior](https://github.com/t2ym/i18n-behavior)

## Features

- Merge changes in next default JSON from current default JSON into next localized JSON with the help of [rfc6902](https://github.com/chbrown/rfc6902)
- Put meta information on merged changes in meta property in JSON for ease of translation
- Output bundles object to merge all the UI texts into JSON per locale
- Export the merged localized JSON as files

## Install

```
    npm install --save-dev gulp-i18n-leverage
```

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
          bundles: {} // default output bundles object is empty
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Scan task

Input:
  - Custom element HTMLs in source

Output: 
  - AttributesRepository object in gulpfile.js

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

Input: 
  - Custom element HTMLs and non-custom-element HTMLs in source

Output: 
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

### Leverage task

Input:
  - Current localized JSON files in source
  - Current default JSON files in source
  - Next default JSON files in dist

Output:
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
          bundles: bundles // output bundles object
        }))
        .pipe(gulp.dest('dist')); // path to output next localized JSON files
    });
```

### Bundles task

Input: 
  - Bundles object in gulpfile.js

Output: 
  - Bundles JSON files in dist

```javascript
    var gulp = require('gulp');
    var fs = require('fs');
    var JSONstringify = require('json-stringify-safe');

    var bundles; // constructed bundles

    gulp.task('bundles', function (callback) {
      var DEST_DIR = 'dist';
      var localesPath = DEST_DIR + '/locales';

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

### Feedback task

Input:
  - Next localized JSON files in dist
  - Custom element HTMLs
  - Non-custom-element HTMLs

Output:
  - Overwritten localized JSON files in source
  - Overwritten default JSON files in source

Outputs are ready to commit in the repository

```
    var gulp = require('gulp');
    var merge = require('merge-stream');
    var i18nPreprocess = require('gulp-i18n-preprocess');

    // Only applicable to development builds; Skip it in production builds
    gulp.task('feedback', function () {
      // Copy from dist
      var locales = gulp.src([ 'dist/**/locales/*.json', '!dist/locales/bundle.*.json'])
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

## API

`i18nLeverage(options)`

### `options` object

- jsonSpace: Number, default: 2 - JSON stringification parameter for formatting
- srcPath: String, default: 'app' - Path to source root
- distPath: String, default: 'dist' - Path to dist root to fetch next default JSON files
- bundles: Object, default {} - Output bundles object

## License

[BSD-2-Clause](https://github.com/t2ym/gulp-i18n-leverage/blob/master/LICENSE.md)
