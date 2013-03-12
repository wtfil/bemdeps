#!/usr/bin/env node
/**
 * Ussage:
 *      bemdeps <params>
 *          -l --levels bem levels
 *          -c --compact making deps more compact
 *          -t --tetchs bem tetchs
 *          -f --forse replacing origin deps.js file
 */
var fs = require('fs'),
    vm = require('vm'),
    cwd = process.cwd(),
    Vow = require('vow'),
    skippFilesRegExp = /(^(examples|tests))|(\.[\w\.]+)$/,
    /**
     * command line arguments
     */
    args = {},
    /**
     * bem levels
     */
    tetchs,
    tetchsRegExpString,
    parseDeps,
    levels;

/**
 * getting argumments from command line
 * @ex -k val           will give {k: 'val'}
 * @ex -k val1 val2     will give {k: 'val1 val2'}
 * @ex --key val        will give {key: 'val'}
 * @ex -k1 -k2 val      will give {k1: true, k2: 'val'}
 */
args = (function () {
    var i = 2,
        reg = /^\-{1,2}(\w+)$/,
        args = {},
        argVals = [],
        pushArg = function () {
            if (argName) {
                args[argName] = argVals.length ? argVals.join(' ') : true;
            }
        },
        argName, val, match;

    for (; i < process.argv.length; i++) {
        val = process.argv[i];
        match = val.match(reg);
        if (match) {
            pushArg();
            argName = match[1];
            argVals = [];
        } else {
            argVals.push(val);
        }
    }
    pushArg();
    return args;
}());

levels = args.l || args.levels;
if (!levels || !levels.length) {
    levels = 'blocks-desktop blocks-common';
    console.log('Default levels is: %s', levels);
}

tetchs = args.t || args.tetchs;
if (!tetchs) {
    tetchs = 'js css priv.js bemhtml';
    console.log('Default tetchs is: %s', tetchs);
}
tetchsRegExpString = '\\.(' + tetchs.replace(/\s+/g, '|') + ')$';

function Deps(block) {
    if (block instanceof Object) {
        this._blockName = block.block;
        this._elems = block.elems || [];
        this._mods = block.mods || {};
    } else {
        this._blockName = block;
        this._elems = [];
        this._mods = {};
    }
    this._mustDeps = false;
};

Deps.prototype = {
    valueOf: function () {
        var deps = {};

        if (this._blockName) {
            deps.block = this._blockName;
        }

        if (this._elems.length) {
            deps.elems = this._elems;
        }

        if (Object.keys(this._mods).length) {
            deps.mods = this._mods;
        }

        return deps;
    },

    pushElem: function (elem) {
        uniquePush(this._elems, elem);
    },

    pushMods: function (modName, modVal) {
        this._mods[modName] = modVal;
    },

    isMust: function () {
        return this._mustDeps;
    },

    setMust: function () {
        this._mustDeps = true;
    }
};


function uniquePush(arr, val) {

    if (arr.indexOf(val) === -1) {
        arr.push(val);
    }
}

function getName(blockName, elemName, modName, modVal) {
    var hasMod = modName && modVal;

    if (!elemName && !hasMod) {
        return blockName + '/' + blockName;
    } else if (elemName && !hasMod) {
        return blockName + '/' + elemName + '/' + blockName + elemName;
    } else if (!elemName && hasMod) {
        return blockName + '/' + modName + '/' + blockName + modName + modVal;
    } else if (elemName && hasMod) {
        return blockName + '/' + elemName + '/' + modName + '/' + blockName + elemName + modName + modVal;
    }
    

}

/**
 * Finding mods of blocks or elems
 * @param {String} path path = level + blockName
 * @param {String} blockName
 * @param {String} elemName=null
 * @param {Array.<String>} files
 * @return {Vow.promise} ({Array.<String>} targets)
 */
function getTargetMods(path, blockName, elemName, files) {
    var targets = [];

    return Vow.all(files.map(function (modName) {
        var defer = Vow.promise(),
            fullPath = path + '/' + modName;

        if (skippFilesRegExp.test(modName) || !/^_[^_]/.test(modName)) {
            defer.fulfill();
            return defer;
        }

        fs.readdir(fullPath, function (err, modFiles) {
            var reg = new RegExp(blockName + (elemName || '') + modName + '(_[a-z\\d]+)' + tetchsRegExpString);

            if (!err) {
                modFiles.forEach(function (modFile) {
                    var match = modFile.match(reg);

                    if (match) {
                        uniquePush(targets, getName(blockName, elemName, modName, match[1]));
                    }

                });
            }
            defer.fulfill();

        });

        return defer;

    })).then(function () {
        return targets;
    });
}

/**
 * Finding elems
 * @param {String} path path = level + blockName
 * @param {String} blockName
 * @param {Array.<String>} files
 * @return {Vow.promise} ({Array.<String>} targets)
 */
function getTargetElems(path, blockName, files) {
    var targets = [];

    return Vow.all(files.map(function (elemPath) {
        var defer = Vow.promise(),
            fullPath = path + '/' + elemPath;
            
        // todo: getting name scheme from .bem
        if (skippFilesRegExp.test(elemPath) || !/^__/.test(elemPath)) {
            defer.fulfill();
            return defer;
        }

        fs.readdir(fullPath, function (err, elemFiles) {
            var reg = new RegExp(blockName + elemPath + tetchsRegExpString),
                target = getName(blockName, elemPath);

            if (!err) {
                elemFiles.forEach(function (elemFile) {
                    if (reg.test(elemFile)) {
                        uniquePush(targets, target);
                    }
                });
            }
            getTargetMods(fullPath, blockName, elemPath, elemFiles)
                .then(function (newTargets) {
                    newTargets.forEach(function (target) {
                        uniquePush(targets, target);
                    });
                    defer.fulfill();
                });

        });

        return defer;
    })).then(function () {
        return targets;
    });

}



/**
 * Finding blocks
 * @param {String} level Pathname
 */
function getTargets(level) {
    var defer = Vow.promise(),
        targets = [];

    fs.readdir(level, function (err, blocks) {
        if (err) {
            return defer.reject(err);
        }
        Vow.all(
            blocks.map(function (blockName) {
                var path = level + '/' + blockName,
                    pathDefer = Vow.promise();
                
                fs.readdir(path, function (err, files) {
                    var reg = new RegExp(blockName + tetchsRegExpString);
                    if (err) {
                        return; // TODO
                    }

                    files.forEach(function (file) {
                        if (reg.test(file)) {
                            uniquePush(targets, getName(blockName));
                        }
                    });

                    Vow.all([
                        getTargetElems.call(null, path, blockName, files),
                        getTargetMods.call(null, path, blockName, null, files)
                    ]).then(
                        function (newTargets) {
                            newTargets.forEach(function (tt) {
                                tt.forEach(function (target) {
                                    uniquePush(targets, target);
                                });
                            });
                            pathDefer.fulfill();
                        }
                    );
                });

                return pathDefer;

            })
        ).then(function () {
            defer.fulfill(targets);
        }).done();
    });
    return defer;
}

function mergeDeps(allDeps) {
    var mustDeps = [],
        shouldDeps = [],
        resut = {};

    Object.keys(allDeps).forEach(function (key) {
        var deps = allDeps[key];

        if (deps.isMust()) {
            mustDeps.push(deps.valueOf());
        } else {
            shouldDeps.push(deps.valueOf());
        }
    });

    if (!mustDeps.length && !shouldDeps.length) {
        return null;
    }

    if (mustDeps.length) {
        resut.mustDeps = mustDeps;
    }
    if (shouldDeps.length) {
        resut.shouldDeps = shouldDeps;
    }

    return resut;
}


parseDeps = (function () {
    var parseRE = /\*\s*@(must|should)?deps\s+(.+)\s*$/i,
        splitBlocksRE = /\s*,\s*/,
        splitComponentsRE = /\s+/,
        blockRE = /^(i|b|l)\-\w+/,
        elemRE = /^[a-z\d]+$/,
        modRE = /^([a-z\d]+)_([a-z\d]+)$/,
        getCurrentBlock = function (allDeps, name) {
            allDeps[name] = allDeps[name] || new Deps(name);
            return allDeps[name];
        };

    return function (source) {
        var allDeps = {},
            resut = {};

        source.split('\n').forEach(function (line) {
            var match = line.match(parseRE);

            if (match) {
                match[2].split(splitBlocksRE).forEach(function (components) {
                    var currentBlock,
                        mustDeps = match[1] === 'must',
                        modMatch;

                    components.split(splitComponentsRE).forEach(function (component) {
                        if (/\!/.test(component)) {
                            if (match[1] === 'should') {
                                console.error('Warning: ussing ! in @shouldDeps "%s"', line.replace(/\s*\*\s*/, ''));
                            }
                            component = component.replace(/\!/g, '');
                            mustDeps = true;
                        }

                        if (blockRE.test(component)) {
                            currentBlock = getCurrentBlock(allDeps, component);
                        } else if (elemRE.test(component)) {

                            if (!currentBlock) {
                                currentBlock = getCurrentBlock(allDeps, null);
                            }

                            currentBlock.pushElem(component);
                        } else if ((modMatch = component.match(modRE))) {

                            if (!currentBlock) {
                                currentBlock = getCurrentBlock(allDeps, null);
                            }

                            currentBlock.pushMods(modMatch[1], modMatch[2]);
                        }
                    });

                    if (currentBlock && mustDeps) {
                        currentBlock.setMust();
                    }
                });
            }
        });


        return mergeDeps(allDeps);
    };
}());

function extendDeps(originalDeps, newDeps) {
    var names = [];

    [originalDeps, newDeps].forEach(function (depsObj) {
        ['mustDeps', 'shouldDeps'].forEach(function (keyName) {
            (depsObj[keyName] || []).forEach(function (deps) {
                var current;

                if (!names[deps.block]) {
                    current = names[deps.block] = new Deps(deps);
                } else {
                    current = names[deps.block];
                    if (deps.elems) {
                        deps.elems.forEach(current.pushElem.bind(current));
                    }
                    if (deps.mods) {
                        Object.keys(deps.mods).forEach(function (key) {
                            current.pushMods(key, deps.mods[key]);
                        });
                    }
                }
                if (keyName === 'mustDeps') {
                    current.setMust();
                }
            });
            
        });
    });

    return mergeDeps(names);
}

/**
 * making deps.js file
 * @param {String} level,
 * @param {String} target
 */
function makeDeps(level, target) {
    var path = level + '/' + target,
        sources = [],
        originalDepsDefer = Vow.promise(),
        forse = args.f || args.forse,
        originalDeps;
    
    fs.readFile(path + '.deps.js', 'utf8', function (err, source) {
        if (!err) {
            try { 
                originalDeps = vm.runInThisContext(source);
            } catch (err) {
                console.error('Warning: error in origin deps.js file \033[1;31m%s\033[0m in file \033[1;36m%s.deps.js\033[0m', err, path);
            }
        }
        originalDepsDefer.fulfill();
    });

    Vow.all(
        tetchs.split(/\s+/).map(function (tetch) {
            var defer = Vow.promise();
            fs.readFile(path + '.' + tetch, 'utf8', function (err, source) {
                if (!err) {
                    sources.push(source);
                }
                defer.fulfill();
            });
            return defer;
        }).concat(originalDepsDefer)
    ).then(function () {
        var deps = parseDeps(sources.join('\n')),
            output;

        if (deps) {
            if (!forse && originalDeps) {
                if (originalDeps.origin) {
                    deps = extendDeps(originalDeps.origin, deps);
                    deps.origin = originalDeps.origin;
                } else {
                    deps = extendDeps(originalDeps, deps);
                    deps.origin = originalDeps;
                }
            } else {
                deps.origin = {};
            }
            
            output = JSON.stringify(deps, null, 4);
            fs.writeFile(path + '.deps.js', '(' + output + ')\n');
        }
    }).done();
}

levels.split(/\s+/).forEach(function (level) {
    var path = level[0] === '/' ? level : (cwd + '/' + level);
    getTargets(path).then(function (targets) {
        targets.forEach(function (target) {
            makeDeps(level, target);
        });
    }).done();
});
