const escape = require('./escape');
const validation = require('./validation');
const format = require('./format');
const chrome = require('./chrome');

module.exports = {
  ...escape,
  ...validation,
  ...format,
  ...chrome
};
