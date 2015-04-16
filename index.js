var http = require('http');
var ecstatic = require('ecstatic');
var watch = require('chokidar').watch;
var opn = require('opn');
var Router = require('routes-router');
var path = require('path');
var PassThrough = require('stream').PassThrough;
var inject = require('inject-lr-script');
var vfs = require('vinyl-fs');
var log = require('bole')('documentation');
var handler = require('ecstatic')(process.cwd());
var Emitter = require('events/');

var documentation = require('documentation');
var github = require('documentation/streams/github');

var createTinylr = require('./tinylr');

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
  .boolean('g')
  .describe('g', 'infer links to github in documentation')
  .alias('g', 'github')
  .describe('o', 'output location. omit for stdout, otherwise is a filename for single-file outputs and a directory name for multi-file outputs like html')
  .alias('o', 'output')
  .default('o', 'docs')
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
    log.info({ url: req.url, type: 'static' });
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
        version: version
    });
    documentation(inputs, {
      private: argv.private
    })
    .pipe(argv.g ? github() : new PassThrough({ objectMode: true }))
    .pipe(formatter)
    .pipe(vfs.dest(argv.o))
    .on('end', callback);
}

http.createServer(handler.router).listen(8000, function() {
  watch('.', { ignored: ignores }).on('all', function(/*event , path*/) {
    log.info('change detected, rebuilding documentation');
    makeDocs(function() {
      opn('http://localhost:8000/');
      tinylr.reload();
    });
  });
  console.log('open http://localhost:8000/ in your browser');
});
