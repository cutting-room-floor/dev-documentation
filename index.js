#!/usr/bin/env node
var http = require('http'),
    ecstatic = require('ecstatic'),
    watch = require('chokidar').watch,
    opn = require('opn'),
    pick = require('101/pick'),
    debounce = require('debounce'),
    Router = require('routes-router'),
    path = require('path'),
    PassThrough = require('stream').PassThrough,
    inject = require('inject-lr-script'),
    vfs = require('vinyl-fs'),
    bole = require('bole'),
    log = bole('documentation'),
    handler = require('ecstatic')(process.cwd()),
    Emitter = require('events/'),
    documentation = require('documentation');

var pretty = require('bistre')();
var github = require('documentation/streams/github');
var createTinylr = require('./lib/tinylr');
var router = Router();
var staticHandler = ecstatic('./docs/');
var tinylr = createTinylr({});

var yargs = require('yargs')
  .usage('Usage: $0 <command> [options]')

  .describe('lint', 'check output for common style and uniformity mistakes')

  .boolean('p')
  .describe('p', 'generate documentation tagged as private')
  .alias('p', 'private')

  .describe('name', 'project name. by default, inferred from package.json')
  .describe('version', 'project version. by default, inferred from package.json')

  .describe('t', 'specify a theme: this must be a valid theme module')
  .alias('t', 'theme')

  .boolean('g')
  .describe('g', 'infer links to github in documentation')
  .alias('g', 'github')

  .boolean('polyglot')
  .describe('polyglot', 'support non-javascript languages at the cost of dependency resolution')

  .describe('o', 'output location. omit for stdout, otherwise is a filename for single-file outputs and a directory name for multi-file outputs like html')
  .alias('o', 'output')
  .default('o', 'docs')

  .describe('no', 'do not automatically open a browser window')
  .boolean('no')

  .help('h')
  .alias('h', 'help')

  .example('$0 foo.js', 'parse documentation in a given file'),
  argv = yargs.argv;

router.addRoute('*.html', wildcard(true));
router.addRoute('*', wildcard());

var emitter = new Emitter();
emitter.live = {};
emitter.router = router;
emitter.pending = false;
emitter.contents = '';

handler.router = router;

function wildcard(html) {
  return function(req, res) {
    if (html && emitter.live) res = inject(res, emitter.live);
    log.debug('get %s', req.url);
    staticHandler(req, res);
  };
}

var ignores = [
  'node_modules/**', 'bower_components/**',
  '.git', '.hg', '.svn', '.DS_Store',
  '*.swp', 'thumbs.db', 'desktop.ini', 'docs', 'docs/**'
];

var inputs, name = '', version = '';
if (argv._.length > 0) {
  inputs = argv._;
} else {
  try {
    var p = require(path.resolve('package.json'));
    inputs = [p.main];
    name = argv.name || p.name;
    version = argv.version || p.version;
  } catch(e) {
    yargs.showHelp();
    throw new Error('documentation was given no files and was not run in a module directory');
  }
}

/**
 * Create documentation
 * @param {Function} callback called when build is complete.
 */
function makeDocs(callback) {
  var formatter = documentation.formats.html({
    name: name,
    theme: argv.theme,
    version: version
  });

  documentation(inputs, pick(argv, ['private', 'polyglot']))
    .pipe(argv.g ? github() : new PassThrough({ objectMode: true }))
    .pipe(formatter)
    .pipe(vfs.dest(argv.o))
    .on('end', callback);
}

http.createServer(handler.router).listen(8000, function() {
  watch('.', { ignored: ignores }).on('all', debounce(function(/*event , path*/) {
    log.info('change detected, rebuilding documentation');
    makeDocs(function() {
      log.info('change detected, documentation built: reloading');
      tinylr.reload();
    });
  }, 100));
  if (!argv.no) opn('http://localhost:8000/');
  console.log('open http://localhost:8000/ in your browser');
});

bole.output({
  level: 'info',
  stream: pretty
});

pretty.pipe(process.stdout);
