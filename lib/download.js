const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns');
const params = require('./params');

const MAX_REDIRECTIONS = 3;

/**
 * Is the IP address private, local or reserved? Used to avoid SSRF: a document must not be able to read the internal network.
 *
 * @param  {String}  ip  IPv4 or IPv6
 * @return {Boolean}     true if the address is not a public address
 */
function isPrivateAddress (ip) {
  var _version = net.isIP(ip);
  if (_version === 4) {
    var _p = ip.split('.').map(Number);
    return _p[0] === 0 || _p[0] === 10 || _p[0] === 127 || _p[0] >= 224
      || (_p[0] === 100 && _p[1] >= 64 && _p[1] <= 127)
      || (_p[0] === 169 && _p[1] === 254)
      || (_p[0] === 172 && _p[1] >= 16 && _p[1] <= 31)
      || (_p[0] === 192 && _p[1] === 168)
      || (_p[0] === 192 && _p[1] === 0 && _p[2] === 0)
      || (_p[0] === 198 && (_p[1] === 18 || _p[1] === 19));
  }
  if (_version === 6) {
    var _lower = ip.toLowerCase();
    var _mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(_lower);
    if (_mapped !== null) {
      return isPrivateAddress(_mapped[1]);
    }
    return _lower === '::' || _lower === '::1' || /^f[cd]/.test(_lower) || /^fe[89ab]/.test(_lower) || /^ff/.test(_lower);
  }
  return true; // not an IP: refuse
}

/**
 * DNS lookup which refuses private addresses. The check is done when connecting, so DNS rebinding cannot be used to bypass it.
 */
function safeLookup (hostname, options, callback) {
  dns.lookup(hostname, options, function (err, address, family) {
    if (err) {
      return callback(err);
    }
    var _addresses = Array.isArray(address) ? address : [{ address : address, family : family }];
    for (var i = 0; i < _addresses.length; i++) {
      if (isPrivateAddress(_addresses[i].address) === true) {
        return callback(new Error('the address of "' + hostname + '" is private or local, it is not allowed'));
      }
    }
    return callback(null, address, family);
  });
}

/**
 * Download a file from a public URL (http or https)
 *
 * It is limited by `params.imageDownloadTimeout` (ms) and `params.imageMaxSize` (bytes), follows at most 3 redirections, and
 * refuses private addresses unless `params.imageAllowPrivateNetwork` is true.
 *
 * @param {String}   url
 * @param {Function} callback(err, buffer)
 */
function download (url, callback) {
  var _redirections = 0;
  var _isDone = false;
  function done (err, buffer) {
    if (_isDone === false) {
      _isDone = true;
      callback(err, buffer);
    }
  }
  function get (currentUrl) {
    var _url;
    try {
      _url = new URL(currentUrl);
    }
    catch (e) {
      return done(new Error('invalid URL'));
    }
    if (_url.protocol !== 'http:' && _url.protocol !== 'https:') {
      return done(new Error('only http and https URLs are allowed'));
    }
    var _options = { timeout : params.imageDownloadTimeout };
    if (params.imageAllowPrivateNetwork !== true) {
      _options.lookup = safeLookup;
      // an IP in the URL does not use the lookup function
      var _hostname = _url.hostname.replace(/^\[|\]$/g, '');
      if (net.isIP(_hostname) !== 0 && isPrivateAddress(_hostname) === true) {
        return done(new Error('the address "' + _hostname + '" is private or local, it is not allowed'));
      }
    }
    var _request = (_url.protocol === 'https:' ? https : http).get(_url, _options, function (response) {
      var _status = response.statusCode;
      if (_status >= 300 && _status < 400 && response.headers.location) {
        response.resume();
        if (++_redirections > MAX_REDIRECTIONS) {
          return done(new Error('too many redirections'));
        }
        return get(new URL(response.headers.location, _url).toString());
      }
      if (_status !== 200) {
        response.resume();
        return done(new Error('HTTP status ' + _status));
      }
      var _length = parseInt(response.headers['content-length'], 10);
      if (_length > params.imageMaxSize) {
        response.resume();
        return done(new Error('the file is too big (max ' + params.imageMaxSize + ' bytes)'));
      }
      var _chunks = [];
      var _size = 0;
      response.on('data', function (chunk) {
        _size += chunk.length;
        if (_size > params.imageMaxSize) {
          _request.destroy();
          return done(new Error('the file is too big (max ' + params.imageMaxSize + ' bytes)'));
        }
        _chunks.push(chunk);
      });
      response.on('end', function () {
        done(null, Buffer.concat(_chunks));
      });
      response.on('error', done);
    });
    _request.on('timeout', function () {
      _request.destroy();
      done(new Error('timeout (' + params.imageDownloadTimeout + ' ms)'));
    });
    _request.on('error', done);
  }
  get(url);
}

module.exports = {
  download,
  isPrivateAddress
};
