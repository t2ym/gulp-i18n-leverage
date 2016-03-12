/*
@license https://github.com/t2ym/gulp-i18n-leverage/blob/master/LICENSE.md
Copyright (c) 2016, Tetsuya Mori <t2y3141592@gmail.com>. All rights reserved.
*/
'use strict';

var path = require('path');
var fs = require('fs');
var JSONstringify = require('json-stringify-safe');
var stripBom = require('strip-bom');
var rfc6902 = require('rfc6902');
var deepcopy = require('deepcopy');
var gutil = require('gulp-util');
var through = require('through2');

/**
 * Gulp plugin to merge text changes in the default locale into a localized bundle.
 *
 * @namespace gulp-i18n-leverage
 */
module.exports = function(options) {
  return through.obj(function (file, enc, callback) {
    var jsonSpace = (options && options.jsonSpace !== undefined) ? options.jsonSpace : 2;
    var srcPath = (options && options.srcPath !== undefined) ? options.srcPath : 'app';
    var distPath = (options && options.distPath !== undefined) ? options.distPath : 'dist';
    var finalize = (options && options.finalize !== undefined) ? options.finalize : false;
    var bundles = options && options.bundles ? options.bundles : {};

    if (file.isNull()) {
      return callback(null, file);
    }

    function deepMap(target, source, map) {
      var value;
      for (var prop in source) {
        value = source[prop];
        switch (typeof value) {
        case 'string':
        case 'number':
        case 'boolean':        
          target[prop] = map(value, prop);
          break;
        case 'object':
          if (Array.isArray(value)) {
            // TODO: cannot handle deep objects properly
            target[prop] = target[prop] || [];
            deepMap(target[prop], value, map);
          }
          else {
            target[prop] = target[prop] || {};
            deepMap(target[prop], value, map);
          }
          break;
        default:
          target[prop] = value;
          break;
        }
      }
    }

    function getNextFallbackLanguage(lang) {
      var nextFallbackLanguage = null;
      if (lang && lang.length > 0) {
        var parts = lang.split(/[-_]/);
        if (parts.length >= 2) {
          parts.pop();
          nextFallbackLanguage = parts.join('-');
        }
      }
      return nextFallbackLanguage;
    }

    function parsePath() {
      var r = {};
      r.path = path.resolve(file.path);
      r.base = path.resolve(file.base);
      r.base = r.base[r.base.length - 1] === path.sep ? r.base : r.base + path.sep;
      r.srcBase = r.base.substr(0, r.base.length - 1);
      r.distBase = r.srcBase.substr(0, r.srcBase.length - srcPath.length) + distPath;
      r.urlPath = r.path.substr(r.srcBase.length);
      var splitPath = r.urlPath.split(path.sep + 'locales' + path.sep);
      r.componentBase = splitPath[0];
      r.resourcePath = r.componentBase + path.sep + 'locales';
      r.fileName = splitPath[1];
      r.extName = path.extname(r.fileName);
      var baseNameWithLang = r.fileName.substr(0, r.fileName.length - r.extName.length);
      var splitBaseName = baseNameWithLang.split('.');
      r.lang = splitBaseName.pop();
      r.baseName = r.fileName.substr(0, r.fileName.length - r.extName.length - r.lang.length - 1);
      r.defaultPath = r.componentBase + path.sep + r.baseName + r.extName;
      r.ancestorSrcPaths = [];
      var lang = getNextFallbackLanguage(r.lang);
      while (lang) {
        r.ancestorSrcPaths.push(r.srcBase + r.resourcePath + path.sep + r.baseName + '.' + lang + r.extName);
        lang = getNextFallbackLanguage(lang);
      }
      r.srcDefaultPath = r.srcBase + r.defaultPath;
      r.distDefaultPath = r.distBase + r.defaultPath;
      return r;
    }

    function findPatch(patch, op, path) {
      for (var i in patch) {
        var item = patch[i];
        if (item.op === op && item.path === path) {
          return item;
        }
      }
      return null;
    }

    function findValue(obj, path) {
      var splitPath = path.split('/');
      var value = obj;
      for (var i = 1; i < splitPath.length; i++) {
        value = value[splitPath[i]];
      }
      return value;
    }

    function fragmentObject(obj, path) {
      var fragments = [];
      var op;
      var i;
      switch (typeof obj) {
      case 'object':
        if (Array.isArray(obj)) {
          for (i = 0; i < obj.length; i++) {
            fragments = fragments.concat(fragmentObject(obj[i], path + '/' + i));
          }
        }
        else {
          for (i in obj) {
            fragments = fragments.concat(fragmentObject(obj[i], path + '/' + i));
          }
        }
        break;
      case 'string':
      case 'number':
      case 'boolean':
      case 'function':
      case 'symbol':
      case 'undefined':
      default:
        op = {};
        op[path] = obj;
        fragments = [ op ];
        break;
      }
      return fragments;
    }

    function fragmentOperation(rawOp) {
      var operations = [];
      switch (rawOp.op) {
      case 'add':
      case 'remove':
      case 'replace':
        if (typeof rawOp.value === 'object') {
          fragmentObject(rawOp.value, rawOp.path).forEach(function (op) {
            for (var p in op) {
              operations.push({ op: rawOp.op, path: p, value: op[p] });
            }
          });
        }
        else {
          operations.push(rawOp);
        }
        break;
      case 'move':
      case 'copy':
        if (typeof rawOp.value === 'object') {
          fragmentObject(rawOp.value, '').forEach(function (op) {
            for (var p in op) {
              operations.push({ op: rawOp.op, from: rawOp.from + p, path: rawOp.path + p });
            }
          });
        }
        else {
          operations.push(rawOp);
        }
        break;
      case 'test':
      default:
        operations.push(rawOp);
        break;
      }
      return operations;
    }

    function fragmentPatch(patch) {
      var fragmented = [];
      for (var i = 0; i < patch.length; i++) {
        fragmented = fragmented.concat(fragmentOperation(patch[i]));
      }
      return fragmented;
    }

    function minimizePatch(patch, prev, current) {
      var minimized = [];
      var valueOpMap = {};
      var serialized;
      var i;
      var item, item2;
      var removed;

      // construct valueOpMap
      for (i in patch) {
        item = patch[i];
        if (item.op === 'remove') {
          item.value = findValue(prev, item.path);
        }
        serialized = JSONstringify(item.value);
        valueOpMap[serialized] = valueOpMap[serialized] || [];
        valueOpMap[serialized].push(i);
      }

      // convert remove/add pairs to move operations
      for (i in valueOpMap) {
        if (valueOpMap[i].length === 2) {
          item = patch[valueOpMap[i][0]];
          if (item.op === 'add') {
            item2 = item;
            item = patch[valueOpMap[i][1]];
          }
          else {
            item2 = patch[valueOpMap[i][1]];
          }
          if (item.op === 'remove' && item2.op === 'add') {
            // convert them to move operation
            item.op = 'move';
            item.from = item.path;
            item.path = item2.path;
            delete item.value;
            item2.op = 'noop';
          }
        }
      }

      // construct minimized patch
      for (i in patch) {
        item = patch[i];
        switch (item.op) {
        case 'add':
        case 'remove':
        case 'replace':
        case 'move':
        case 'copy':
          minimized.push(item);
          break;
        case 'test':
        default:
          break;
        }
      }
      return minimized;
    }

    function updateMetaTodo(current, prev)
    {
      var meta = prev.meta || {};
      var prevClone = deepcopy(prev);
      var currentClone = deepcopy(current);
      var patch;
      var i, j;
      delete prevClone.meta;
      delete currentClone.meta;
      current.meta.todo = [];
      patch = rfc6902.createPatch(prevClone, currentClone);
      patch = minimizePatch(patch, prevClone, currentClone);
      //console.log('fragmenting ======================================================================');
      //console.log(JSONstringify(patch, null, 2));
      patch = fragmentPatch(patch);
      //console.log(JSONstringify(patch, null, 2));
      meta.todo = meta.todo || [];
      for (i = 0; i < patch.length; i++) {
        switch (patch[i].op) {
        case 'add':
        case 'replace':
          for (j = 0; j < meta.todo.length; j++) {
            if (meta.todo[j].path === patch[i].path) {
              meta.todo[j].op = 'noop';
              break;
            }
          }
          meta.todo.push(patch[i]);
          break;
        case 'remove':
          for (j = 0; j < meta.todo.length; j++) {
            if (meta.todo[j].path === patch[i].path) {
              meta.todo[j].op = 'noop';
            }
            else if (meta.todo[j].path.indexOf(patch[i].path + '/') === 0) {
              meta.todo[j].op = 'noop';
            }
          }
          break;
        case 'move':
          for (j = 0; j < meta.todo.length; j++) {
            if (meta.todo[j].path === patch[i].from) {
              meta.todo[j].path = patch[i].path;
            }
            else if (meta.todo[j].path.indexOf(patch[i].from + '/') === 0) {
              meta.todo[j].path = patch[i].path + meta.todo[j].path.substr(patch[i].from.length);
            }
          }
          break;
        case 'copy': // TODO: should not happen for now
        case 'test':
        default:
          break;
        }
      }
      for (i = meta.todo.length - 1; i >= 0; i--) {
        if (meta.todo[i].op === 'noop') {
          meta.todo.splice(i, 1);
        }
      }
      current.meta = meta;
      return current;
    }

    function update(paths, contents) {
      var prevDefault;
      var currentDefault;
      var prevLocalized;
      var prevLocalizedOriginal;
      var currentLocalized;
      var prevAncestors = [];
      var patchStatus;
      var i;
      var tmpContents;
      try {
        prevDefault = JSON.parse(stripBom(tmpContents = fs.readFileSync(paths.srcDefaultPath, 'utf8')));
      }
      catch (e) {
        if (!e.toString().match(/SyntaxError/) || tmpContents) {
          gutil.log(gutil.colors.cyan(paths.srcDefaultPath),
                    gutil.colors.yellow(e.toString()));
        }
        prevDefault = { meta: {} }; // presumably file not found
      }
      try {
        currentDefault = JSON.parse(stripBom(tmpContents = fs.readFileSync(paths.distDefaultPath, 'utf8')));
      }
      catch (e) {
        if (!e.toString().match(/SyntaxError/) || tmpContents) {
          gutil.log(gutil.colors.cyan(paths.distDefaultPath),
                    gutil.colors.yellow(e.toString()));
        }
        currentDefault = { meta: {} }; // presumably file not found
      }
      for (i = 0; i < paths.ancestorSrcPaths.length; i++) {
        try {
          prevAncestors[i] = JSON.parse(stripBom(tmpContents = fs.readFileSync(paths.ancestorSrcPaths[i], 'utf8')));
        }
        catch (e) {
          prevAncestors[i] = null; // presumably file not found
        }
      }

      try {
        prevLocalized = JSON.parse(stripBom(contents));
      }
      catch (e) {
        if (!e.toString().match(/SyntaxError/) || contents) {
          gutil.log(gutil.colors.cyan(paths.urlPath),
                    gutil.colors.yellow(e.toString()));
        }
        prevLocalized = { meta: {} };
      }
      prevLocalizedOriginal = deepcopy(prevLocalized);

      var patch = rfc6902.createPatch(prevDefault, currentDefault);
      patch = minimizePatch(patch, prevDefault, currentDefault);

      for (i = 0; i < prevAncestors.length; i++) {
        if (prevAncestors[i]) {
          rfc6902.applyPatch(prevAncestors[i], patch);
        }
      }

      patchStatus = rfc6902.applyPatch(prevLocalized, patch);
      for (i = 0; i < patchStatus.length; i++) {
        if (patchStatus[i]) {
          console.log('warning: ' + patchStatus[i].name +
                                  ' for ' + JSONstringify(patch[i]));
        }
      }

      currentLocalized = deepcopy(currentDefault);

      for (i = 0; i < prevAncestors.length; i++) {
        if (prevAncestors[i]) {
          deepMap(currentLocalized, prevAncestors[i], function (value) { return value; });
        }
      }

      deepMap(currentLocalized, prevLocalized, function (value) { return value; });

      updateMetaTodo(currentLocalized, prevLocalizedOriginal);
      if (finalize) {
        if (currentLocalized.meta &&
            currentLocalized.meta.todo &&
            currentLocalized.meta.todo.length > 0) {
          gutil.log(gutil.colors.cyan(paths.urlPath),
                    gutil.colors.yellow('warning: discarding meta.todo ='),
                    gutil.colors.gray('\n' + JSONstringify(currentLocalized.meta.todo, null, 2)));
        }
        currentLocalized.meta = {};
      }

      //console.log(JSONstringify(patch, null, 2));
      bundles[paths.lang] = bundles[paths.lang] || {};
      bundles[paths.lang][paths.baseName] = deepcopy(currentLocalized);
      bundles[''] = bundles[''] || {};
      bundles[''][paths.baseName] = deepcopy(currentDefault);
      return JSONstringify(currentLocalized, null, jsonSpace);
    }

    function doLeverage() {
      if (file.isNull()) {
        callback(null, file);
        return;
      }

      if (file.isStream()) {
        callback(new gutil.PluginError('leverage', 'Streaming not supported'));
        return;
      }

      if (file.isBuffer()) {
        var contents = String(file.contents);
        var paths = parsePath();
        //console.log(paths);
        var result = update(paths, contents);
        if (result) {
          file.contents = new Buffer(result);
          return callback(null, file);
        }
      }

      callback(null, file);
    }

    doLeverage();
  });
};
